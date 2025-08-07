'use client';

import { useChat } from 'ai/react';
import styles from './page.module.css';

export default function Home() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat',
  });

  return (
    <div className={styles.container}>
      <h1>Grok Chatbot</h1>
      <div className={styles.chat}>
        {messages.map((m) => (
          <div key={m.id} className={styles.message}>
            <strong>{m.role === 'user' ? 'You' : 'Grok'}:</strong> {m.content}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className={styles.form}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Type your message..."
          className={styles.input}
        />
        <button type="submit" className={styles.button}>
          Send
        </button>
      </form>
    </div>
  );
}
