package com.netcradus.acis.keycloak.authenticator;

import org.keycloak.Config;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.authentication.actiontoken.resetcred.ResetCredentialsActionToken;
import org.keycloak.authentication.authenticators.browser.AbstractUsernameFormAuthenticator;
import org.keycloak.common.util.ObjectUtil;
import org.keycloak.common.util.Time;
import org.keycloak.email.EmailException;
import org.keycloak.email.EmailSenderProvider;
import org.keycloak.email.freemarker.beans.ProfileBean;
import org.keycloak.events.Details;
import org.keycloak.events.Errors;
import org.keycloak.events.EventBuilder;
import org.keycloak.events.EventType;
import org.keycloak.forms.login.freemarker.model.UrlBean;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.DefaultActionTokenKey;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.models.KeycloakUriInfo;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.utils.FormMessage;
import org.keycloak.models.utils.KeycloakModelUtils;
import org.keycloak.provider.ProviderConfigProperty;
import org.keycloak.services.messages.Messages;
import org.keycloak.sessions.AuthenticationSessionCompoundId;
import org.keycloak.sessions.AuthenticationSessionModel;
import org.keycloak.theme.Theme;
import org.keycloak.theme.beans.LinkExpirationFormatterMethod;
import org.keycloak.theme.beans.MessageFormatterMethod;
import org.keycloak.theme.freemarker.FreeMarkerProvider;
import org.jboss.logging.Logger;

import jakarta.ws.rs.core.UriBuilder;
import java.text.MessageFormat;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Properties;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Drop-in replacement for Keycloak's built-in reset-credential-email
 * authenticator, closing the timing-based user-enumeration channel (VAPT
 * M-03 residual finding): the built-in authenticator blocks on the SMTP
 * round-trip before responding (~2.3s observed for a real account vs
 * ~0.07s for a nonexistent one), even though both paths already return the
 * same generic response body.
 *
 * Only the actual mail transport (EmailSenderProvider#send, a plain socket
 * write with no Keycloak request-context dependency) is deferred to a
 * background thread. Link generation AND email template rendering stay
 * synchronous on the calling thread: rendering needs KeycloakContext#getUri
 * / #resolveLocale, both of which internally resolve through Quarkus's
 * request-scoped Vert.x context and throw ContextNotActiveException once
 * that request has completed - there is no way to defer them to a plain
 * background thread. Rendering itself is theme-file/CPU work, not network
 * I/O, so keeping it synchronous adds only single-digit milliseconds -
 * nowhere near the multi-second SMTP RTT that made the original
 * authenticator's timing observable.
 */
public class AsyncResetCredentialEmail implements Authenticator, AuthenticatorFactory {

    private static final Logger logger = Logger.getLogger(AsyncResetCredentialEmail.class);

    public static final String PROVIDER_ID = "acis-async-reset-credential-email";

    private static final ExecutorService EXECUTOR = Executors.newFixedThreadPool(4, r -> {
        Thread t = new Thread(r, "acis-async-reset-email");
        t.setDaemon(true);
        return t;
    });

    @Override
    public void authenticate(AuthenticationFlowContext context) {
        UserModel user = context.getUser();
        AuthenticationSessionModel authenticationSession = context.getAuthenticationSession();
        String username = authenticationSession.getAuthNote(AbstractUsernameFormAuthenticator.ATTEMPTED_USERNAME);

        if (user == null) {
            context.forkWithSuccessMessage(new FormMessage(Messages.EMAIL_SENT));
            return;
        }

        String actionTokenUserId = authenticationSession.getAuthNote(DefaultActionTokenKey.ACTION_TOKEN_USER_ID);
        if (actionTokenUserId != null && Objects.equals(user.getId(), actionTokenUserId)) {
            context.success();
            return;
        }

        EventBuilder event = context.getEvent();
        if (user.getEmail() == null || user.getEmail().trim().length() == 0) {
            event.user(user).detail(Details.USERNAME, username).error(Errors.INVALID_EMAIL);
            context.forkWithSuccessMessage(new FormMessage(Messages.EMAIL_SENT));
            return;
        }

        KeycloakSession session = context.getSession();
        RealmModel realm = context.getRealm();

        int validityInSecs = realm.getActionTokenGeneratedByUserLifespan(ResetCredentialsActionToken.TOKEN_TYPE);
        int absoluteExpirationInSecs = Time.currentTime() + validityInSecs;
        String authSessionEncodedId = AuthenticationSessionCompoundId.fromAuthSession(authenticationSession).getEncodedId();
        ResetCredentialsActionToken token = new ResetCredentialsActionToken(
                user.getId(), user.getEmail(), absoluteExpirationInSecs, authSessionEncodedId,
                authenticationSession.getClient().getClientId());
        String link = UriBuilder
                .fromUri(context.getActionTokenUrl(token.serialize(session, realm, context.getUriInfo())))
                .build()
                .toString();
        long expirationInMinutes = TimeUnit.SECONDS.toMinutes(validityInSecs);

        // Replicates FreeMarkerEmailTemplateProvider#sendPasswordReset +
        // #processTemplate, stopping short of the actual send. Must run on
        // this thread - it depends on the live request context.
        Map<String, String> smtpConfig = realm.getSmtpConfig();
        String recipientEmail = user.getEmail();
        String subject;
        String textBody;
        String htmlBody;
        try {
            Theme theme = session.theme().getTheme(Theme.Type.EMAIL);
            Locale locale = session.getContext().resolveLocale(user);
            Properties messages = theme.getEnhancedMessages(realm, locale);

            Map<String, Object> attributes = new HashMap<>();
            attributes.put("link", link);
            attributes.put("linkExpiration", expirationInMinutes);
            attributes.put("linkExpirationFormatter", new LinkExpirationFormatterMethod(theme.getMessages(locale), locale));
            attributes.put("locale", locale);
            attributes.put("msg", new MessageFormatterMethod(locale, messages));
            attributes.put("properties", theme.getProperties());
            attributes.put("realmName", realm.getDisplayName() != null ? realm.getDisplayName() : ObjectUtil.capitalize(realm.getName()));
            attributes.put("user", new ProfileBean(user, session));
            KeycloakUriInfo uriInfo = session.getContext().getUri();
            attributes.put("url", new UrlBean(realm, theme, uriInfo.getBaseUri(), null));

            subject = new MessageFormat(messages.getProperty("passwordResetSubject", "passwordResetSubject"), locale)
                    .format(new Object[0]);

            FreeMarkerProvider freeMarker = session.getProvider(FreeMarkerProvider.class);
            textBody = freeMarker.processTemplate(attributes, "text/password-reset.ftl", theme);
            htmlBody = freeMarker.processTemplate(attributes, "html/password-reset.ftl", theme);
        } catch (Exception e) {
            // Never surface this to the caller - a template/theme error must not
            // produce a response distinguishable from the generic success path.
            logger.warn("Failed to render password reset email; email will not be sent", e);
            context.forkWithSuccessMessage(new FormMessage(Messages.EMAIL_SENT));
            return;
        }

        KeycloakSessionFactory sessionFactory = session.getKeycloakSessionFactory();

        event.clone().event(EventType.SEND_RESET_PASSWORD)
                .user(user)
                .detail(Details.USERNAME, username)
                .detail(Details.EMAIL, user.getEmail())
                .detail(Details.CODE_ID, authenticationSession.getParentSession().getId())
                .success();

        // Only the genuinely slow, network-bound part - the SMTP round-trip -
        // is deferred. EmailSenderProvider#send takes plain data (config map,
        // address, pre-rendered strings) and never touches request-scoped
        // context, so it's safe to run outside the original request thread.
        EXECUTOR.submit(() -> {
            try {
                KeycloakModelUtils.runJobInTransaction(sessionFactory, bgSession -> {
                    try {
                        bgSession.getProvider(EmailSenderProvider.class)
                                .send(smtpConfig, recipientEmail, subject, textBody, htmlBody);
                    } catch (EmailException e) {
                        logger.warnf(e, "Async password reset email failed to send to '%s'", recipientEmail);
                    }
                });
            } catch (RuntimeException e) {
                logger.warn("Async password reset job failed", e);
            }
        });

        context.forkWithSuccessMessage(new FormMessage(Messages.EMAIL_SENT));
    }

    @Override
    public void action(AuthenticationFlowContext context) {
        context.getUser().setEmailVerified(true);
        context.success();
    }

    @Override
    public boolean requiresUser() {
        return false;
    }

    @Override
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
        return true;
    }

    @Override
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {
    }

    @Override
    public String getDisplayType() {
        return "Send Reset Email (Async, ACIS)";
    }

    @Override
    public String getReferenceCategory() {
        return null;
    }

    @Override
    public boolean isConfigurable() {
        return false;
    }

    public static final AuthenticationExecutionModel.Requirement[] REQUIREMENT_CHOICES = {
            AuthenticationExecutionModel.Requirement.REQUIRED
    };

    @Override
    public AuthenticationExecutionModel.Requirement[] getRequirementChoices() {
        return REQUIREMENT_CHOICES;
    }

    @Override
    public boolean isUserSetupAllowed() {
        return false;
    }

    @Override
    public String getHelpText() {
        return "Sends the password reset email asynchronously, so the response is returned immediately regardless "
                + "of SMTP latency - closes the timing-based user-enumeration channel (VAPT M-03) present in the "
                + "built-in synchronous authenticator.";
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        return null;
    }

    @Override
    public void close() {
    }

    @Override
    public Authenticator create(KeycloakSession session) {
        return this;
    }

    @Override
    public void init(Config.Scope config) {
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
    }

    @Override
    public String getId() {
        return PROVIDER_ID;
    }
}
