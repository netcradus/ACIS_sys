import Keycloak from 'keycloak-js'

/**
 * Singleton Keycloak instance.
 * Configured from Vite env vars (.env file).
 * Initialized once in main.tsx via keycloak.init().
 */
const keycloak = new Keycloak({
  url:      import.meta.env.VITE_KEYCLOAK_URL   ?? 'http://localhost:8180',
  realm:    import.meta.env.VITE_KEYCLOAK_REALM ?? 'acis',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'acis-frontend',
})

export default keycloak
