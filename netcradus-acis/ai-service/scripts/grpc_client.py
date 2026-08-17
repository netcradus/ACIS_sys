# Standalone manual dev/test script — NOT part of the served application
# (never imported by app/main.py or anything else in the request path;
# confirmed via a production-readiness audit). Exercises the real gRPC
# ThreatIntelService this ai-service container also runs (see
# app/grpc_server.py) from outside the process, for manual verification
# during development. Excluded from the built image (ai-service/.dockerignore).
#
# Usage: python scripts/grpc_client.py [indicator] [type]
#   GRPC_TARGET_HOST/GRPC_TARGET_PORT override the default localhost:50051 -
#   e.g. to point this at a running Docker container instead of a local
#   `python app/main.py` process.
import grpc
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'grpc_stubs'))
import acis_ai_pb2
import acis_ai_pb2_grpc

GRPC_TARGET_HOST = os.environ.get('GRPC_TARGET_HOST', 'localhost')
GRPC_TARGET_PORT = os.environ.get('GRPC_TARGET_PORT', '50051')


def run_test(indicator='1.2.3.4', ioc_type='ip'):
    channel = grpc.insecure_channel(f'{GRPC_TARGET_HOST}:{GRPC_TARGET_PORT}')
    stub = acis_ai_pb2_grpc.ThreatIntelServiceStub(channel)
    req = acis_ai_pb2.EnrichIocRequest(indicator=indicator, type=ioc_type)
    resp = stub.EnrichIoc(req, timeout=5)
    print('Received response:')
    print(resp)


if __name__ == '__main__':
    args = sys.argv[1:]
    run_test(*args) if args else run_test()
