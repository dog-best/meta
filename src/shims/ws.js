class WebSocketStub {
  constructor() {
    throw new Error("WebSocket is not supported in this React Native build.");
  }
}

module.exports = WebSocketStub;
module.exports.default = WebSocketStub;
