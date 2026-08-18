FROM python:3.11-slim
# A container vuln scan (Trivy) found real, fixed-upstream HIGH CVEs in the
# base image's util-linux family (bsdutils/libblkid1/libmount1/login/mount/
# etc, all CVE-2026-53615) that a fresh `apt-get upgrade` picks up - verified
# directly. Remaining findings in this base (perl-base, ncurses, gzip,
# libssl3t64/openssl) have no upstream Debian fix published yet as of this
# scan; perl/ncurses/gzip are unused by this app at runtime (uvicorn/Python
# only) and the container runs as a non-root user with no exposed shell, so
# this is accepted as residual risk pending an upstream Debian patch rather
# than something this Dockerfile can resolve today.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 appuser
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chown -R appuser:appuser /app
USER appuser
EXPOSE 8090
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
