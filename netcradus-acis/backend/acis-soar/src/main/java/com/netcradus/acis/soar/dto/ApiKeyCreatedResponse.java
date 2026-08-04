package com.netcradus.acis.soar.dto;

import com.netcradus.acis.common.apikey.ApiKey;

/**
 * Response for a freshly created API key. rawToken is the only time the real
 * secret is ever transmitted — it is not persisted anywhere (only its hash
 * is), so the frontend must show it to the user exactly once and cannot
 * retrieve it again afterward.
 */
public record ApiKeyCreatedResponse(ApiKey key, String rawToken) {
}
