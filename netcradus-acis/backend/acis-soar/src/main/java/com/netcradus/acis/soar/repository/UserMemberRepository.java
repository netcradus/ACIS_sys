package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.UserMember;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface UserMemberRepository extends JpaRepository<UserMember, UUID> {
}
