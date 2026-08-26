import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Comprehensive emoji categories for tracking
const EMOJI_CATEGORIES = {
  "Food & Drink": [
    "🍎", "🍊", "🍋", "🍌", "🍇", "🍓", "🫐", "🍒", "🍑", "🥭",
    "🍍", "🥥", "🥝", "🍅", "🥑", "🥦", "🥬", "🥒", "🌶️", "🫑",
    "🌽", "🥕", "🧄", "🧅", "🥔", "🍠", "🥐", "🥯", "🍞", "🥖",
    "🥨", "🧀", "🥚", "🍳", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭",
    "🍔", "🍟", "🍕", "🫓", "🥪", "🥙", "🧆", "🌮", "🌯", "🫔",
    "🥗", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🍤", "🍙",
    "🍚", "🍘", "🍥", "🥠", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧",
    "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫", "🍿", "🧈", "🥛",
    "🍼", "☕", "🍵", "🧃", "🥤", "🧋", "🍶", "🍺", "🍻", "🥂",
    "🍷", "🥃", "🍸", "🍹", "🧊", "🫖", "🥄", "🍴", "🥢",
  ],
  "Health & Fitness": [
    "💪", "🏃", "🏋️", "🤸", "🧘", "🚴", "🏊", "⚽", "🏀", "🎾",
    "🏈", "⚾", "🥏", "🏐", "🏓", "🏸", "🥊", "🥋", "⛳", "🎯",
    "💊", "💉", "🩺", "🩹", "🏥", "❤️", "🫀", "🧠", "🦷", "👁️",
    "👃", "👂", "🦶", "🦵", "💤", "😴", "🛌", "🧘‍♀️", "🧘‍♂️", "🏄",
    "🚶", "🚶‍♀️", "🚶‍♂️", "🧗", "⛰️", "🥾", "🎿", "🛷", "⛸️", "🤿",
  ],
  "Activities & Lifestyle": [
    "📚", "📖", "📝", "✏️", "🖊️", "🎨", "🎭", "🎬", "🎤", "🎧",
    "🎹", "🎸", "🎺", "🎻", "🥁", "🎮", "🎲", "♟️", "🧩", "🎰",
    "🎳", "🛹", "🛼", "🏂", "🧗‍♀️", "🏇", "🎪", "🎡", "🎢", "🎠",
    "💻", "📱", "⌨️", "🖥️", "🖨️", "📸", "📷", "🎥", "📺", "📻",
    "⏰", "⏱️", "⏲️", "🕐", "📅", "📆", "🗓️", "✈️", "🚗", "🚌",
  ],
  "Nature & Weather": [
    "☀️", "🌤️", "⛅", "🌥️", "☁️", "🌦️", "🌧️", "⛈️", "🌩️", "🌨️",
    "❄️", "💨", "🌪️", "🌈", "☔", "⚡", "🌊", "💧", "💦", "🔥",
    "🌸", "🌺", "🌻", "🌼", "🌷", "🌹", "🥀", "💐", "🌱", "🌲",
    "🌳", "🌴", "🌵", "🍀", "☘️", "🍃", "🍂", "🍁", "🪻", "🪷",
  ],
  "Emotions & Symbols": [
    "😊", "😀", "😃", "😄", "😁", "😆", "🥹", "😅", "😂", "🤣",
    "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😜",
    "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐",
    "😑", "😶", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥", "😌", "😔",
    "⭐", "🌟", "✨", "💫", "⚡", "🔥", "💥", "❤️", "🧡", "💛",
    "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞",
    "💓", "💗", "💖", "💘", "💝", "✅", "❌", "⭕", "❗", "❓",
    "💯", "🏆", "🥇", "🥈", "🥉", "🎖️", "🏅", "🎗️", "👑", "💎",
  ],
  "Objects": [
    "🎁", "🎀", "🎈", "🎉", "🎊", "🧸", "🪆", "🖼️", "🛍️", "👜",
    "👛", "👝", "🎒", "🧳", "👓", "🕶️", "🥽", "👔", "👕", "👖",
    "🧣", "🧤", "🧥", "🧦", "👗", "👘", "🥻", "🩱", "🩲", "🩳",
    "👙", "👚", "👒", "🎩", "🧢", "⛑️", "💄", "💍", "💎", "🔔",
    "🔕", "📣", "📢", "🔑", "🗝️", "🔒", "🔓", "🔐", "🔏", "📌",
  ],
};

// Flatten all emojis for search
const ALL_EMOJIS = Object.values(EMOJI_CATEGORIES).flat();

// Common preset emojis for quick selection
const PRESET_EMOJIS = [
  "💧", "🏋️", "🛌", "🚶", "🚴", "☕", "🍬", "💊", "📚", "😊",
  "🍎", "🥗", "🍔", "🥤", "💪", "🧘", "✅", "⭐", "❤️", "🎯",
];

interface EmojiPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  selectedEmoji?: string;
}

export default function EmojiPicker({
  visible,
  onClose,
  onSelect,
  selectedEmoji,
}: EmojiPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredEmojis = useMemo(() => {
    if (searchQuery.trim()) {
      // Simple search - just filter all emojis (you could add keyword search later)
      return ALL_EMOJIS;
    }
    if (selectedCategory) {
      return EMOJI_CATEGORIES[selectedCategory as keyof typeof EMOJI_CATEGORIES] || [];
    }
    return null; // Show categories view
  }, [searchQuery, selectedCategory]);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    onClose();
    setSearchQuery("");
    setSelectedCategory(null);
  };

  const handleClose = () => {
    onClose();
    setSearchQuery("");
    setSelectedCategory(null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 bg-black/80 justify-end">
          <Pressable className="flex-1" onPress={handleClose} />
          <View className="bg-dark rounded-t-3xl max-h-[70%]">
            {/* Header */}
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-lighter">
              <Text className="text-lg font-bold text-white">Choose Icon</Text>
              <Pressable onPress={handleClose} className="p-2 active:opacity-70">
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>

            {/* Search */}
            <View className="px-5 py-3">
              <View className="flex-row items-center bg-dark-light rounded-xl px-4 py-3">
                <Ionicons name="search" size={20} color="#767676" />
                <TextInput
                  className="flex-1 ml-3 text-white text-base"
                  placeholder="Search emojis..."
                  placeholderTextColor="#767676"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery("")}>
                    <Ionicons name="close-circle" size={20} color="#767676" />
                  </Pressable>
                )}
              </View>
            </View>

            {/* Back button when in category */}
            {selectedCategory && !searchQuery && (
              <Pressable
                onPress={() => setSelectedCategory(null)}
                className="flex-row items-center px-5 py-2 active:opacity-70"
              >
                <Ionicons name="chevron-back" size={20} color="#eab308" />
                <Text className="text-accent-500 ml-1">Back to categories</Text>
              </Pressable>
            )}

            <ScrollView className="px-5 pb-8" showsVerticalScrollIndicator={false}>
              {/* Preset Quick Select */}
              {!filteredEmojis && !searchQuery && (
                <View className="mb-6">
                  <Text className="text-sm text-neutral-light mb-3">Quick Select</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {PRESET_EMOJIS.map((emoji) => (
                      <Pressable
                        key={emoji}
                        onPress={() => handleSelect(emoji)}
                        className={`w-12 h-12 rounded-xl items-center justify-center ${
                          selectedEmoji === emoji
                            ? "bg-accent-500"
                            : "bg-dark-light border border-dark-lighter"
                        }`}
                      >
                        <Text className="text-2xl">{emoji}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {/* Categories or Emojis */}
              {filteredEmojis ? (
                <View className="mb-6">
                  <Text className="text-sm text-neutral-light mb-3">
                    {searchQuery ? "Search Results" : selectedCategory}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {filteredEmojis.map((emoji, index) => (
                      <Pressable
                        key={`${emoji}-${index}`}
                        onPress={() => handleSelect(emoji)}
                        className={`w-12 h-12 rounded-xl items-center justify-center ${
                          selectedEmoji === emoji
                            ? "bg-accent-500"
                            : "bg-dark-light border border-dark-lighter"
                        }`}
                      >
                        <Text className="text-2xl">{emoji}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <View className="mb-6">
                  <Text className="text-sm text-neutral-light mb-3">Categories</Text>
                  <View className="gap-2">
                    {Object.keys(EMOJI_CATEGORIES).map((category) => {
                      const emojis = EMOJI_CATEGORIES[category as keyof typeof EMOJI_CATEGORIES];
                      return (
                        <Pressable
                          key={category}
                          onPress={() => setSelectedCategory(category)}
                          className="flex-row items-center justify-between bg-dark-light rounded-xl px-4 py-4 active:opacity-70"
                        >
                          <View className="flex-row items-center">
                            <Text className="text-2xl mr-3">{emojis[0]}</Text>
                            <Text className="text-white text-base font-medium">{category}</Text>
                          </View>
                          <View className="flex-row items-center">
                            <Text className="text-neutral text-sm mr-2">{emojis.length}</Text>
                            <Ionicons name="chevron-forward" size={18} color="#767676" />
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Safe area bottom padding */}
              <View className="h-8" />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
