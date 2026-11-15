import mongoose from "mongoose";

export function getHealth(_request, response) {
  const databaseConnected = mongoose.connection.readyState === 1;
  const statusCode = databaseConnected ? 200 : 503;

  response.status(statusCode).json({
    status: databaseConnected ? "ok" : "degraded",
    database: {
      status: databaseConnected ? "connected" : "disconnected",
    },
  });
}
