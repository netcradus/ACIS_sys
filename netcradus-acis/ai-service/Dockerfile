FROM python:3.11-slim
# A container vuln scan (Trivy) found real, fixed-upstream HIGH CVEs in the
# base image's util-linux family (bsdutils/libblkid1/libmount1/login/mount/
# etc, all CVE-2026-53615) that a fresh `apt-get upgrade` picks up - verified
# directly.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# perl-base was the source of all 4 CRITICAL findings (CVE-2026-13221,
# CVE-2026-42496, CVE-2026-57433, CVE-2026-8376). Checked Debian's own
# security tracker directly: none have a fix in trixie-security as of this
# scan (only in sid/experimental, neither viable for production), and
# switching to bookworm doesn't help either - it carries its own different,
# also-unfixed set of perl CVEs (verified). This app is FastAPI/uvicorn only
# and never invokes perl at runtime, so the real fix is removing the package
# entirely rather than accepting the risk indefinitely. Debian marks
# perl-base "Essential", which is why --allow-remove-essential is required -
# verified directly that both Python and dpkg remain fully functional after
# removal (dpkg itself is a C program; it doesn't require perl to function,
# despite the Essential flag).
RUN apt-get update \
    && apt-get remove --purge -y --allow-remove-essential perl-base \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Remaining findings in this base (ncurses, gzip, libssl3t64/openssl) still
# have no upstream Debian fix published as of this scan and are needed by
# the base system (openssl) or are lower-value force-removals of more
# Essential packages than is prudent to stack in one image. The container
# runs as a non-root user with no exposed shell, so this is accepted as
# residual risk pending an upstream Debian patch.
RUN useradd -m -u 1000 appuser
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chown -R appuser:appuser /app
USER appuser
EXPOSE 8090
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
