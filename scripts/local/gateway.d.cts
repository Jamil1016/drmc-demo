import type { Server } from "node:http";
export function startGateway(port?: number): Promise<Server>;
