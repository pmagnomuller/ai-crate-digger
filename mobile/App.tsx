import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { streamChat } from './src/api/chatClient';
import { playBase64Audio, stopAudio } from './src/audio/player';
import { clearChatHistory, loadChatHistory, saveChatHistory } from './src/storage/chatHistory';
import { ChatHistoryMessage, ChatMessage } from './src/types/chat';

function createMessage(role: 'user' | 'assistant', content: string): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    createdAt: Date.now(),
  };
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const cancelStreamRef = useRef<null | (() => void)>(null);

  const assistantHistory = useMemo(
    () => messages.filter((m) => m.role === 'user' || m.role === 'assistant'),
    [messages],
  );

  useEffect(() => {
    void (async () => {
      const stored = await loadChatHistory();
      setMessages(stored);
    })();
  }, []);

  useEffect(() => {
    void saveChatHistory(messages);
  }, [messages]);

  useEffect(() => {
    return () => {
      cancelStreamRef.current?.();
      void stopAudio();
    };
  }, []);

  const sendMessage = (): void => {
    const prompt = input.trim();
    if (!prompt || isStreaming) return;

    setErrorText(null);
    setInput('');
    setStreamingText('');
    setIsStreaming(true);

    const userMessage = createMessage('user', prompt);
    const history: ChatHistoryMessage[] = assistantHistory.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMessage]);

    cancelStreamRef.current = streamChat(
      {
        prompt,
        history,
        includeAudio: true,
        maxResults: 6,
        maxToolRounds: 5,
      },
      {
        onEvent: (event) => {
          if (event.type === 'token') {
            setStreamingText((prev) => prev + event.data);
          }

          if (event.type === 'error') {
            setErrorText(event.data.message);
          }

          if (event.type === 'final_answer') {
            const assistantMessage = createMessage('assistant', event.data.text);
            if (event.data.audio) {
              assistantMessage.audioBase64 = event.data.audio.base64Audio;
              assistantMessage.audioMimeType = event.data.audio.mimeType;
            }
            setMessages((prev) => [...prev, assistantMessage]);
            setStreamingText('');

            if (event.data.audio) {
              void playBase64Audio(event.data.audio.base64Audio, event.data.audio.mimeType).catch(
                () => {
                  setErrorText('Audio playback failed');
                },
              );
            }
          }
        },
        onError: (message) => setErrorText(message),
        onDone: () => setIsStreaming(false),
      },
    );
  };

  const replayMessageAudio = async (message: ChatMessage): Promise<void> => {
    if (!message.audioBase64 || !message.audioMimeType) return;
    try {
      await playBase64Audio(message.audioBase64, message.audioMimeType);
    } catch {
      Alert.alert('Audio error', 'Unable to replay this message audio.');
    }
  };

  const onClearHistory = (): void => {
    Alert.alert('Clear conversation?', 'This removes all local chat history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setMessages([]);
          setStreamingText('');
          void clearChatHistory();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <View style={styles.header}>
          <Text style={styles.title}>AI Crate Digger</Text>
          <Pressable style={styles.clearButton} onPress={onClearHistory}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </Pressable>
        </View>

        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageBubble,
                item.role === 'user' ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              <Text style={styles.messageRole}>{item.role === 'user' ? 'You' : 'Assistant'}</Text>
              <Text style={styles.messageText}>{item.content}</Text>
              {item.audioBase64 ? (
                <Pressable style={styles.audioButton} onPress={() => void replayMessageAudio(item)}>
                  <Text style={styles.audioButtonText}>Replay audio</Text>
                </Pressable>
              ) : null}
            </View>
          )}
          ListFooterComponent={
            isStreaming ? (
              <View style={styles.messageBubble}>
                <Text style={styles.messageRole}>Assistant</Text>
                <Text style={styles.messageText}>{streamingText || 'Thinking...'}</Text>
                <ActivityIndicator />
              </View>
            ) : null
          }
        />

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask for records..."
            editable={!isStreaming}
            multiline
          />
          <Pressable
            style={[styles.sendButton, isStreaming ? styles.sendButtonDisabled : null]}
            onPress={sendMessage}
            disabled={isStreaming}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  container: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  clearButton: {
    backgroundColor: '#e5e7eb',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearButtonText: {
    color: '#111827',
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 12,
    gap: 8,
  },
  messageBubble: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 6,
  },
  userBubble: {
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
  },
  assistantBubble: {
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  messageRole: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#4b5563',
  },
  messageText: {
    fontSize: 15,
    color: '#111827',
    lineHeight: 21,
  },
  audioButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  audioButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  errorText: {
    color: '#dc2626',
    marginBottom: 8,
    fontSize: 13,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingBottom: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
