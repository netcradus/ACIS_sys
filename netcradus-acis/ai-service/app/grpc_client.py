import grpc
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'grpc_stubs'))
import acis_ai_pb2
import acis_ai_pb2_grpc


def run_test(indicator='1.2.3.4', ioc_type='ip'):
    channel = grpc.insecure_channel('localhost:50051')
    stub = acis_ai_pb2_grpc.ThreatIntelServiceStub(channel)
    req = acis_ai_pb2.EnrichIocRequest(indicator=indicator, type=ioc_type)
    resp = stub.EnrichIoc(req, timeout=5)
    print('Received response:')
    print(resp)


if __name__ == '__main__':
    run_test()
