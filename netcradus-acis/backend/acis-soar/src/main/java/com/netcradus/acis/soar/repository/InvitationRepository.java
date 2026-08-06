package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.Invitation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InvitationRepository extends JpaRepository<Invitation, UUID> {

    /**
     * Deliberately NOT a JOIN FETCH on userMember: tried that first, but
     * user_members has its own standard tenant-matching RLS policy with no
     * bypass for this lookup (only invitations' policy honors
     * app.allow_invitation_lookup) — Postgres silently drops the joined row
     * since the caller's tenant isn't known yet, and Hibernate 6 then throws
     * FetchNotFoundException because the (non-nullable) FK column has a
     * value but the fetched association came back empty. Plain lazy
     * reference instead: InvitationService.findValid() only ever reads
     * userMember.getId() off the resulting proxy (safe without a session —
     * the identifier is already known from the FK column), then re-fetches
     * the real UserMember normally, after the real tenant id is set.
     */
    Optional<Invitation> findByTokenHash(String tokenHash);

    List<Invitation> findByUserMemberId(UUID userMemberId);
}
