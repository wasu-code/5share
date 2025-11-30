import React, { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Camera, Download, X, Plus, Send } from "lucide-react";
import Peer from "peerjs";
import { BrowserQRCodeReader } from "@zxing/browser";

const App = () => {
  const [peerId, setPeerId] = useState("");
  const [conn, setConn] = useState(null);
  const [peer, setPeer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [files, setFiles] = useState([]);
  const [qrMode, setQrMode] = useState("generate");
  const [isConnected, setIsConnected] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [scanning, setScanning] = useState(false);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const qrReaderRef = useRef(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const connectId = urlParams.get("id");

    if (connectId) {
      const newPeer = new Peer();
      newPeer.on("open", id => {
        setPeerId(id);
        setPeer(newPeer);
        connectToPeer(newPeer, connectId);
      });
    } else {
      const guid = generateGuid();
      const newPeer = new Peer(guid);
      newPeer.on("open", id => {
        setPeerId(id);
        setPeer(newPeer);
      });

      newPeer.on("connection", connection => {
        setupConnection(connection);
      });
    }

    return () => {
      stopScanning();
      if (peer) {
        peer.destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (messages.length > 0)
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (qrMode === "scan" && !scanning) {
      startScanning();
    } else if (qrMode === "generate" && scanning) {
      stopScanning();
    }
  }, [qrMode]);

  const generateGuid = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const connectToPeer = (peerInstance, targetId) => {
    const connection = peerInstance.connect(targetId);
    setupConnection(connection);
  };

  const setupConnection = connection => {
    connection.on("open", () => {
      setConn(connection);
      setIsConnected(true);
      addMessage("System", "Connected to peer");
    });

    connection.on("data", data => {
      console.log("Received data:", data.type);

      if (data.type === "message") {
        addMessage("Peer", data.content);
      } else {
        receiveFile(data);
      }
    });

    connection.on("close", () => {
      setIsConnected(false);
      addMessage("System", "Connection closed");
    });

    connection.on("error", err => {
      console.error("Connection error:", err);
      addMessage("System", "Connection error occurred");
    });
  };

  const addMessage = (sender, content) => {
    setMessages(prev => [
      ...prev,
      { sender, content, time: new Date().toLocaleTimeString() },
    ]);
  };

  const sendMessage = () => {
    if (!messageInput.trim() || !conn) return;

    conn.send({ type: "message", content: messageInput });
    addMessage("You", messageInput);
    setMessageInput("");
  };

  const handleFileSelect = e => {
    const selectedFiles = Array.from(e.target.files);
    selectedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = event => {
        const fileData = {
          name: file.name,
          type: file.type,
          size: file.size,
          data: event.target.result,
          id: Date.now() + Math.random(),
        };
        setFiles(prev => [...prev, fileData]);

        if (conn && isConnected) {
          sendFile(fileData);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const sendFile = fileData => {
    try {
      conn.send({ type: "file", ...fileData });
      addMessage("System", `Sent file: ${fileData.name}`);
    } catch (err) {
      console.error("Error sending file:", err);
      addMessage("System", `Failed to send file: ${fileData.name}`);
    }
  };

  const receiveFile = fileData => {
    setFiles(prev => [...prev, fileData]);
    addMessage("System", `Received file: ${fileData.name}`);
  };

  const downloadFile = file => {
    const link = document.createElement("a");
    link.href = file.data;
    link.download = file.name;
    link.click();
  };

  const startScanning = async () => {
    if (scanning || qrReaderRef.current) return;
    setScanning(true);
    qrReaderRef.current = new BrowserQRCodeReader();

    try {
      const devices = await BrowserQRCodeReader.listVideoInputDevices();
      if (devices.length === 0) {
        throw new Error("No camera found");
      }

      // Prefer back camera
      const backCamera = devices.find(
        d =>
          d.label.toLowerCase().includes("back") ||
          d.label.toLowerCase().includes("rear")
      );
      const deviceId = backCamera ? backCamera.deviceId : devices[0].deviceId;

      // Start continuous scanning
      await qrReaderRef.current.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result, error, controls) => {
          if (result) {
            try {
              const url = result.getText();

              const urlObj = new URL(url);
              const scannedId = urlObj.searchParams.get("id");

              if (scannedId) {
                stopScanning();
                controls.stop();
                addMessage(
                  "System",
                  `Connecting to: ${scannedId.slice(0, 8)}...`
                );

                window.location.href = url;
              }
            } catch (err) {
              console.error("Error parsing QR code:", err);
            }
          }
        }
      );
    } catch (err) {
      console.error("Error starting camera:", err);
      addMessage("System", "Camera access denied or unavailable");
      setScanning(false);
      qrReaderRef.current = null;
    }
  };

  const stopScanning = () => {
    if (qrReaderRef.current) {
      try {
        qrReaderRef.current = null;
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
      qrReaderRef.current = null;
    }
    setScanning(false);
  };

  const getConnectionUrl = () => {
    return `${window.location.origin}${window.location.pathname}?id=${peerId}`;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-4">
          {/* Left Panel - QR and Files */}
          <div className="space-y-4">
            {/* QR Section */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setQrMode("generate")}
                  className={`flex-1 px-4 py-2 rounded transition ${
                    qrMode === "generate"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Generate
                </button>
                <button
                  onClick={() => setQrMode("scan")}
                  className={`flex-1 px-4 py-2 rounded transition ${
                    qrMode === "scan"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Scan
                </button>
              </div>

              <div className="border-2 border-gray-300 rounded-lg p-4 h-64 flex items-center justify-center bg-white overflow-hidden">
                {qrMode === "generate" && peerId ? (
                  <div className="flex flex-col items-center">
                    <QRCodeSVG value={getConnectionUrl()} size={200} />
                    <p className="text-xs mt-2 text-gray-600 break-all max-w-full px-2">
                      {peerId}
                    </p>
                  </div>
                ) : qrMode === "scan" ? (
                  <div className="w-full h-full flex items-center justify-center relative">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="max-w-full max-h-full object-contain"
                    />
                    {!scanning && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                        <div className="text-center">
                          <Camera
                            size={48}
                            className="text-gray-400 mx-auto mb-2"
                          />
                          <span className="text-sm text-gray-600">
                            Starting camera...
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-gray-400">Initializing...</div>
                )}
              </div>

              <div
                className={`mt-2 text-center px-3 py-2 rounded transition ${
                  isConnected
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {isConnected ? "🟢 Connected" : "⚪ Not Connected"}
              </div>
            </div>

            {/* Files Section */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <h2 className="text-xl font-semibold mb-4">Files</h2>
              <div className="flex gap-2 overflow-x-auto pb-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="min-w-20 h-20 border-2 border-dashed border-gray-300 bg-white rounded-lg flex items-center justify-center hover:border-blue-500 hover:bg-blue-50 transition sticky left-0 z-10"
                >
                  <Plus size={24} className="text-gray-400" />
                </button>

                {files.map(file => (
                  <div
                    key={file.id}
                    className="min-w-20 h-20 border-2 border-gray-300 rounded-lg overflow-hidden relative cursor-pointer hover:border-blue-500 transition shrink-0"
                    onClick={() => setSelectedFile(file)}
                  >
                    {file.type.startsWith("image/") ? (
                      <img
                        src={file.data}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded">
                        <span className="text-xs text-gray-600 px-1 text-center break-all">
                          {file.name.slice(0, 10)}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        downloadFile(file);
                      }}
                      className="absolute top-1 right-1 bg-white rounded p-1 shadow-md hover:bg-green-400 transition"
                    >
                      <Download size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          </div>

          {/* Right Panel - Messages */}
          <div className="bg-white rounded-lg shadow-md p-4 flex flex-col h-[600px]">
            <h2 className="text-xl font-semibold mb-4">Messages</h2>

            <div className="flex-1 overflow-y-auto mb-4 space-y-2">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg max-w-[80%] ${
                    msg.sender === "You"
                      ? "bg-blue-500 text-white ml-auto text-right"
                      : msg.sender === "System"
                      ? "bg-gray-200 text-gray-700 text-center text-sm mx-auto"
                      : "bg-gray-300 text-gray-800"
                  }`}
                >
                  <div className="font-semibold text-sm">{msg.sender}</div>
                  <div>{msg.content}</div>
                  <div className="text-xs opacity-75 mt-1">{msg.time}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={messageInput}
                onChange={e => setMessageInput(e.target.value)}
                onKeyPress={e => e.key === "Enter" && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!isConnected}
              />
              <button
                onClick={sendMessage}
                disabled={!isConnected || !messageInput.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* File Preview Modal */}
      {selectedFile && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedFile(null)}
        >
          <div
            className="bg-white rounded-lg p-4 max-w-4xl max-h-[90vh] overflow-auto relative"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedFile(null)}
              className="absolute top-2 right-2 bg-gray-200 rounded-full p-2 hover:bg-gray-300 transition"
            >
              <X size={20} />
            </button>

            <h3
              className="text-xl font-semibold mb-4 pr-10 break-words"
              title={selectedFile.name}
            >
              {selectedFile.name}
            </h3>

            {selectedFile.type.startsWith("image/") ? (
              <img
                src={selectedFile.data}
                alt={selectedFile.name}
                className="max-w-full rounded"
              />
            ) : (
              <div className="text-center p-8">
                <p className="text-gray-600 mb-4">Preview not available</p>
                <button
                  onClick={() => downloadFile(selectedFile)}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                >
                  Download File
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
