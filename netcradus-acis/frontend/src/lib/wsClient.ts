import { Client, StompSubscription, IMessage } from '@stomp/stompjs'

type MessageCallback = (message: IMessage) => void

/**
 * Lazy-connect STOMP WebSocket singleton.
 *
 * Uses native WebSocket (no sockjs-client) for production compatibility.
 * @stomp/stompjs v7+ supports native WebSocket directly.
 */

let stompClient: Client | null = null
let connectPromise: Promise<void> | null = null

let currentEndpoint = '/ws'

function buildWsUrl(endpoint: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${endpoint}`
}

function createClient(endpoint: string): Client {
  return new Client({
    brokerURL: buildWsUrl(endpoint),
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
