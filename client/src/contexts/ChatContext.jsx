import PropTypes from "prop-types";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import socket from "../socket";

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [messages,    setMessages]    = useState([]);
  const [rateLimited, setRateLimited] = useState(false);

  useEffect(() => {
    const onChatMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    const onChatRateLimited = ({ message }) => {
      setRateLimited(message);
      setTimeout(() => setRateLimited(false), 3000);
    };

    socket.on("chat_message",      onChatMessage);
    socket.on("chat_rate_limited", onChatRateLimited);

    return () => {
      socket.off("chat_message",      onChatMessage);
      socket.off("chat_rate_limited", onChatRateLimited);
    };
  }, []);

  const sendMessage = useCallback((roomId, message) => {
    if (!message?.trim()) return;
    socket.emit("room_chat", { roomId, message: message.trim() });
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  const providerValue = useMemo(
    () => ({ messages, rateLimited, sendMessage, clearMessages }),
    [messages, rateLimited, sendMessage, clearMessages]
  );

  return <ChatContext.Provider value={providerValue}>{children}</ChatContext.Provider>;
};

ChatProvider.propTypes = { children: PropTypes.node.isRequired };

export const useChat = () => useContext(ChatContext);
