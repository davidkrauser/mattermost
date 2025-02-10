// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import WebSocketClient from './websocket';

// Define some WebSocket globals that aren't defined in node
if (typeof WebSocket === 'undefined') {
    (global as any).WebSocket = {
        CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3,
    };
}

export class MockWebSocket {
    readonly binaryType: BinaryType = 'blob';
    readonly bufferedAmount: number = 0;
    readonly extensions: string = '';

    readonly CONNECTING = WebSocket.CONNECTING;
    readonly OPEN = WebSocket.OPEN;
    readonly CLOSING = WebSocket.CLOSING;
    readonly CLOSED = WebSocket.CLOSED;

    public url: string = '';
    readonly protocol: string = '';
    public readyState: number = WebSocket.CONNECTING;

    public onopen: (() => void) | null = null;
    public onclose: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public onmessage: ((evt: any) => void) | null = null;

    open() {
        this.readyState = WebSocket.OPEN;
        if (this.onopen) {
            this.onopen();
        }
    }

    close() {
        this.readyState = WebSocket.CLOSED;
        if (this.onclose) {
            this.onclose();
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    send(msg: any) { }
    addEventListener() { }
    removeEventListener() { }
    dispatchEvent(): boolean {
        return false;
    }
}

describe('websocketclient', () => {
    test('should call callbacks', () => {
        const mockWebSocket = new MockWebSocket();

        const client = new WebSocketClient({
            newWebSocketFn: (url: string) => {
                mockWebSocket.url = url;
                return mockWebSocket;
            },
        });
        client.initialize('mock.url');

        expect(mockWebSocket.onopen).toBeTruthy();
        mockWebSocket.onopen = jest.fn();
        expect(mockWebSocket.onclose).toBeTruthy();
        mockWebSocket.onclose = jest.fn();

        mockWebSocket.open();

        expect(mockWebSocket.onopen).toHaveBeenCalled();
        expect(mockWebSocket.readyState).toBe(mockWebSocket.OPEN);

        mockWebSocket.close();

        expect(mockWebSocket.onclose).toHaveBeenCalled();
        expect(mockWebSocket.readyState).toBe(mockWebSocket.CLOSED);

        client.close();
    });

    test('should reconnect on websocket close', (done) => {
        const mockWebSocket = new MockWebSocket();
        mockWebSocket.open = jest.fn(mockWebSocket.open);

        const client = new WebSocketClient({
            newWebSocketFn: (url: string) => {
                mockWebSocket.url = url;
                mockWebSocket.open();
                return mockWebSocket;
            },
            minWebSocketRetryTime: 1,
            reconnectJitterRange: 1,
        });
        client.initialize('mock.url');

        mockWebSocket.close();

        setTimeout(() => {
            client.close();
            expect(mockWebSocket.open).toHaveBeenCalledTimes(2);
            done();
        }, 10);
    });

    test('should stay connected after ping response', done => {
        let mockWebSocket = new MockWebSocket();

        let numPings = 0;
        let numOpens = 0;
        mockWebSocket.send = (evt) => {
            if (mockWebSocket.onmessage) {
                const ping = JSON.parse(evt);
                const msg = {
                    action: "pong",
                    seq_reply: ping.seq,
                };
                mockWebSocket.onmessage({ data: JSON.stringify(msg) });
            }
            numPings++;
        }

        let client = new WebSocketClient({
            newWebSocketFn: (url: string) => {
                mockWebSocket.url = url;
                if (mockWebSocket.onopen) {
                    mockWebSocket.open();
                    numOpens++;
                }
                return mockWebSocket;
            },
            minWebSocketRetryTime: 1,
            reconnectJitterRange: 1,
            clientPingEnabled: true,
            clientPingInterval: 1,
        });
        client.initialize("mock.url")
        mockWebSocket.open();
        numOpens++;

        setTimeout(() => {
            client.close()
            expect(numOpens).toBe(1)
            expect(numPings).toBeGreaterThan(1)
            done()
        }, 10)
    });

    test('should reconnect after no ping response', done => {
        let mockWebSocket = new MockWebSocket();

        let numPings = 0;
        let numOpens = 0;
        mockWebSocket.send = () => { numPings++; return undefined };

        let client = new WebSocketClient({
            newWebSocketFn: (url: string) => {
                mockWebSocket.url = url;
                if (mockWebSocket.onopen) {
                    mockWebSocket.open();
                    numOpens++;
                }
                return mockWebSocket;
            },
            minWebSocketRetryTime: 1,
            reconnectJitterRange: 1,
            clientPingEnabled: true,
            clientPingInterval: 1,
        });
        client.initialize("mock.url")
        mockWebSocket.open();
        numOpens++;

        setTimeout(() => {
            client.close()
            expect(Math.abs(numOpens - numPings)).toBeLessThanOrEqual(1)
            done()
        }, 10)
    });


    test('should close during reconnection delay', (done) => {
        const mockWebSocket = new MockWebSocket();
        mockWebSocket.open = jest.fn(mockWebSocket.open);

        const client = new WebSocketClient({
            newWebSocketFn: (url: string) => {
                mockWebSocket.url = url;
                if (mockWebSocket.onopen) {
                    mockWebSocket.open();
                }
                return mockWebSocket;
            },
            minWebSocketRetryTime: 50,
            reconnectJitterRange: 1,
        });
        client.initialize = jest.fn(client.initialize);
        client.initialize('mock.url');
        mockWebSocket.open();
        mockWebSocket.close();

        setTimeout(() => {
            client.close();
        }, 10);

        setTimeout(() => {
            client.close();
            expect(client.initialize).toBeCalledTimes(1);
            expect(mockWebSocket.open).toBeCalledTimes(1);
            done();
        }, 80);
    });

    test('should not re-open if initialize called during reconnection delay', (done) => {
        const mockWebSocket = new MockWebSocket();
        mockWebSocket.open = jest.fn(mockWebSocket.open);

        const client = new WebSocketClient({
            newWebSocketFn: (url: string) => {
                mockWebSocket.url = url;
                if (mockWebSocket.onopen) {
                    mockWebSocket.open();
                }
                return mockWebSocket;
            },
            minWebSocketRetryTime: 50,
            reconnectJitterRange: 1,
        });
        client.initialize = jest.fn(client.initialize);
        client.initialize('mock.url');
        mockWebSocket.open();
        mockWebSocket.close();

        setTimeout(() => {
            client.initialize('mock.url');
            expect(client.initialize).toBeCalledTimes(2);
            expect(mockWebSocket.open).toBeCalledTimes(1);
        }, 10);

        setTimeout(() => {
            client.close();
            expect(client.initialize).toBeCalledTimes(3);
            expect(mockWebSocket.open).toBeCalledTimes(2);
            done();
        }, 80);
    });

    test('should not register second reconnection timeout if onclose called twice', (done) => {
        const mockWebSocket = new MockWebSocket();
        mockWebSocket.open = jest.fn(mockWebSocket.open);

        const client = new WebSocketClient({
            newWebSocketFn: (url: string) => {
                mockWebSocket.url = url;
                if (mockWebSocket.onopen) {
                    mockWebSocket.open();
                }
                return mockWebSocket;
            },
            minWebSocketRetryTime: 50,
            reconnectJitterRange: 1,
        });
        client.initialize = jest.fn(client.initialize);
        client.initialize('mock.url');
        mockWebSocket.open();
        mockWebSocket.close();

        setTimeout(() => {
            mockWebSocket.close();
        }, 10);

        setTimeout(() => {
            client.close();
            expect(client.initialize).toBeCalledTimes(2);
            expect(mockWebSocket.open).toBeCalledTimes(2);
            done();
        }, 80);
    });
});
