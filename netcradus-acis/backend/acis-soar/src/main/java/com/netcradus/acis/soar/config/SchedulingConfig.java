package com.netcradus.acis.soar.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * Without a "taskScheduler"-named bean, @EnableScheduling falls back to a
 * single-threaded scheduler shared by every @Scheduled method in this
 * service - confirmed live: with SyslogListenerService.sync() (every 30s)
 * and IntegrationPollerService's vendor polls (real outbound HTTP calls with
 * real network latency) sharing that one thread,
 * BruteForceAlertPublisher.pollLockouts() never got a turn to run at all,
 * silently. A real security-alerting job being starved by an unrelated
 * integration poll is exactly the kind of "detection exists but never
 * fires" gap this whole effort is about closing. Spring Boot auto-detects a
 * bean of type TaskScheduler named "taskScheduler" and wires it in - no
 * SchedulingConfigurer needed for the common case.
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {

    @Bean
    public ThreadPoolTaskScheduler taskScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(6);
        scheduler.setThreadNamePrefix("acis-soar-scheduled-");
        return scheduler;
    }
}
