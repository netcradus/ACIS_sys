package com.netcradus.acis.correlation.controller;

import com.netcradus.acis.common.dto.CorrelationRuleDto;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Real Bean Validation coverage for CorrelationRuleDto — a tenant-authored
 * rule's splQuery is later run as a regex predicate against every real event
 * through CorrelationEngine, so an unbounded/malformed rule isn't just a bad
 * request, it's a real per-event cost multiplier. This exercises the actual
 * Hibernate Validator, not just that the annotations compile.
 */
class CorrelationRuleDtoValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    private static CorrelationRuleDto validRule() {
        return CorrelationRuleDto.builder()
                .name("Excessive 401 Failures")
                .splQuery("index=web status=401 | stats count by clientip | where count > 100")
                .severity("HIGH")
                .riskScore(85)
                .windowMinutes(5)
                .build();
    }

    @Test
    void aFullyPopulatedRealRulePassesValidation() {
        assertThat(validator.validate(validRule())).isEmpty();
    }

    @Test
    void blankNameIsRejected() {
        CorrelationRuleDto rule = validRule();
        rule.setName("  ");
        Set<ConstraintViolation<CorrelationRuleDto>> violations = validator.validate(rule);
        assertThat(violations).anyMatch(v -> v.getPropertyPath().toString().equals("name"));
    }

    @Test
    void blankSplQueryIsRejected() {
        CorrelationRuleDto rule = validRule();
        rule.setSplQuery("");
        Set<ConstraintViolation<CorrelationRuleDto>> violations = validator.validate(rule);
        assertThat(violations).anyMatch(v -> v.getPropertyPath().toString().equals("splQuery"));
    }

    @Test
    void oversizedSplQueryIsRejected() {
        CorrelationRuleDto rule = validRule();
        rule.setSplQuery("x".repeat(4001));
        Set<ConstraintViolation<CorrelationRuleDto>> violations = validator.validate(rule);
        assertThat(violations).anyMatch(v -> v.getPropertyPath().toString().equals("splQuery"));
    }

    @Test
    void severityOutsideTheRealEnumIsRejected() {
        CorrelationRuleDto rule = validRule();
        rule.setSeverity("APOCALYPTIC");
        Set<ConstraintViolation<CorrelationRuleDto>> violations = validator.validate(rule);
        assertThat(violations).anyMatch(v -> v.getPropertyPath().toString().equals("severity"));
    }

    @Test
    void riskScoreOutOfRangeIsRejected() {
        CorrelationRuleDto tooHigh = validRule();
        tooHigh.setRiskScore(101);
        CorrelationRuleDto negative = validRule();
        negative.setRiskScore(-1);

        assertThat(validator.validate(tooHigh)).anyMatch(v -> v.getPropertyPath().toString().equals("riskScore"));
        assertThat(validator.validate(negative)).anyMatch(v -> v.getPropertyPath().toString().equals("riskScore"));
    }
}
