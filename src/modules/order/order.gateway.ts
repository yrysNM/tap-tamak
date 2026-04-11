// // WebSocket tools (NestJS): gateway + message subscription decorators.
// import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
// import type { Server, Socket } from 'socket.io';

// interface OrderStatusPayload {
//   orderId: string;
//   status: string;
// }

// // WebSocket gateway: clients connect under the `/orders` namespace.
// @WebSocketGateway({ namespace: '/orders', cors: true })
// export class OrderGateway {
//   // WebSocket server instance (socket.io) injected by NestJS.
//   @WebSocketServer()
//   server: Server;

//   notifyStatusChange(orderId: string, payload: OrderStatusPayload) {
//     // WebSocket emit: push order status updates to the order room.
//     this.server.to(`order:${orderId}`).emit('status_changed', payload);
//   }

//   updateCourierLocation(orderId: string, lat: number, lng: number) {
//     // WebSocket emit: push courier location updates to the order room.
//     this.server.to(`order:${orderId}`).emit('location_update', { lat, lng });
//   }

//   // WebSocket handler: client subscribes to updates for one order.
//   @SubscribeMessage('join_order')
//   handleJoin(@MessageBody() orderId: string, @ConnectedSocket() client: Socket) {
//     // WebSocket room join: enables targeted emits via `server.to(room)`.
//     client.join(`order:${orderId}`);
//   }
// }

