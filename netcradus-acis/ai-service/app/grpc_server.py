import grpc
from concurrent import futures
import logging
import sys
import os

# Add grpc_stubs to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'grpc_stubs'))
import acis_ai_pb2
import acis_ai_pb2_grpc
from . import threat_intel_client

logger = logging.getLogger("ai-service-grpc")

class ThreatIntelServiceServicer(acis_ai_pb2_grpc.ThreatIntelServiceServicer):
    def EnrichIoc(self, request, context):
        logger.info(f"Received EnrichIoc request for {request.indicator} (type={request.type})")

        result = threat_intel_client.enrich(request.indicator, request.type)

        return acis_ai_pb2.EnrichIocResponse(
            indicator=request.indicator,
            threat_score=result["threat_score"],
            categories=result["categories"],
            description=result["description"],
        )

def serve_grpc():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    acis_ai_pb2_grpc.add_ThreatIntelServiceServicer_to_server(ThreatIntelServiceServicer(), server)
    server.add_insecure_port('[::]:50051')
    logger.info("Starting gRPC server on port 50051")
    server.start()
    server.wait_for_termination()

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    serve_grpc()
