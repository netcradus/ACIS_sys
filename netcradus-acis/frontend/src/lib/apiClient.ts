import axios from 'axios'
import keycloak from './keycloak'

/**
 * Configured Axios instance for all ACIS API calls.
 *
 * Request interceptor:
 *   1. Calls keycloak.updateToken(30) — refreshes the access token if it
 *      expires within 30 seconds. Silent and automatic.
 *   2. Attaches Bearer token to every request.
 *   3. Attaches X-Tenant-ID header from token claims.
 *
 * Response interceptor:
 *   - 401 → triggers keycloak.login() to re-authenticate.
 */
const apiClient = axios.create({
  baseURL: '/',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30_000,
})


apiClient.interceptors.request.use(async (config) => {
  if (keycloak.authenticated) {
    try {
      // Refresh token if it will expire within 30 seconds
      await keycloak.updateToken(30)
    } catch {
      // Refresh token itself has expired — force re-login
      keycloak.login()
      return Promise.reject(new Error('Session expired — redirecting to login'))
    }

    config.headers.Authorization = `Bearer ${keycloak.token}`

    // Attach tenant ID from JWT claim (populated in Phase 2+)
    const tenantId = (keycloak.tokenParsed as Record<string, unknown>)?.tenant_id as string | undefined
    if (tenantId) {
      config.headers['X-Tenant-ID'] = tenantId
    }
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => {
    // ApiResponse uses @JsonInclude(NON_NULL), so a failure envelope
    // ({success:false, error:{...}}) omits the "data" key entirely rather
    // than including it as null — checking for "success" alone (not both
    // "success" and "data") is required to catch failure envelopes here.
    if (response.data && typeof response.data === 'object' && 'success' in response.data) {
      if (response.data.success === false) {
        const message = response.data.error?.message || 'Request failed'
        const err = new Error(message) as Error & { response?: typeof response; apiError?: unknown }
        err.response = response
        err.apiError = response.data.error
        return Promise.reject(err)
      }
      response.data = response.data.data
    }
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      keycloak.login()
    }
    return Promise.reject(error)
  }
)

export default apiClient
