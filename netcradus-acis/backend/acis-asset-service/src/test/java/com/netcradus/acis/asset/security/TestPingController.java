package com.netcradus.acis.asset.security;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Trivial authenticated endpoint used only by JwtAuthenticationTest. */
@RestController
public class TestPingController {

    @GetMapping("/api/assets/ping")
    public String ping() {
        return "ok";
    }
}
