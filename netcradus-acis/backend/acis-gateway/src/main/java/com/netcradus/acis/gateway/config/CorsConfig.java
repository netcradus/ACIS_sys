package com.netcradus.acis.gateway.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsConfigurationSource;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * CORS configuration for the gateway.
 */
@Configuration
public class CorsConfig {

    private static final Logger log = LoggerFactory.getLogger(CorsConfig.class);

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        String corsEnv = System.getenv("CORS_ALLOWED_ORIGINS");
        if (corsEnv != null && !corsEnv.isBlank()) {
            config.setAllowedOrigins(List.of(corsEnv.split(",")));
        } else {
            // Silent fallback previously - a prod deployment that forgets to
            // set CORS_ALLOWED_ORIGINS (docker-compose.prod.yml does set it
            // correctly, but this also runs for any other deployment method)
            // would see every browser request fail with an opaque CORS
            // error and nothing in these logs pointing at the cause.
            log.warn("CORS_ALLOWED_ORIGINS is not set - falling back to localhost dev origins " +
                    "(http://localhost:3000/3001/3002). If this is a production deployment, real " +
                    "browser requests from your actual domain will be rejected by CORS.");
            config.setAllowedOrigins(List.of("http://localhost:3000", "http://localhost:3001", "http://localhost:3002"));
        }
        
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("X-Tenant-ID", "X-Request-ID", "Authorization", "X-Export-Row-Count", "X-Export-Truncated"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return source;
    }
}

