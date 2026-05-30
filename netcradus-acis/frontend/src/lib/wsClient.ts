import { Client, StompSubscription, IMessage } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

type MessageCallback = (message: IMessage) => void

/**
 * Lazy-connect STOMP WebSocket singleton.
 *
 * IMPORTANT: connect() is called ONLY on the first subscribe() call.
 * It is NEVER called on module import or app initialization.
 * This prevents WebSocket connection errors in Phase 1 where no WS server exists.
 */

let stompClient: Client | null = null
let connectPromise: Promise<void> | null = null

let currentEndpoint = '/ws'

function createClient(endpoint: string): Client {
  return new Client({
    webSocketFactory: () =>
      new SockJS(endpoint),

    reconnectDelay: 5000,
    onConnect: () => {
      console.info('[WS] STOMP connected')
    },
    onDisconnect: () => {
      console.info('[WS] STOMP disconnected')
    },
    onStompError: (frame) => {
      console.error('[WS] STOMP error', frame)
    },
  })
}

function ensureConnected(endpoint: string): Promise<void> {
  if (connectPromise && currentEndpoint === endpoint) return connectPromise
  if (stompClient) {
      stompClient.deactivate()
  }

  currentEndpoint = endpoint
  stompClient = createClient(endpoint)

  connectPromise = new Promise<void>((resolve) => {
    stompClient!.onConnect = () => {
      console.info(`[WS] STOMP connected to ${endpoint}`)
      resolve()
    }
    stompClient!.activate()
  })

  return connectPromise
}

const wsClient = {
  /**
   * Subscribe to a STOMP topic.
   * Triggers connection if not yet connected.
   */
  async subscribe(topic: string, callback: MessageCallback, endpoint: string = '/ws/alerts'): Promise<StompSubscription> {
    await ensureConnected(endpoint)
    return stompClient!.subscribe(topic, callback)
  },

  /**
   * Publish a message to a destination.
   */
  async publish(destination: string, body: string, endpoint: string = '/ws/alerts'): Promise<void> {
    await ensureConnected(endpoint)
    stompClient!.publish({ destination, body })
  },

  /**
   * Disconnect and reset.
   */
  disconnect(): void {
    stompClient?.deactivate()
    stompClient = null
    connectPromise = null
  },
}

export default wsClient
