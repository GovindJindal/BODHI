import React, { useRef, useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, FontSize } from '../../theme/tokens';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
}

const OTPBox = ({ index, isFocused, hasValue, children }: any) => {
  const animatedStyle = useAnimatedStyle(() => ({
    borderColor: withTiming(
      isFocused ? Colors.neonLime : hasValue ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)'
    ),
    backgroundColor: withTiming(
      isFocused ? 'rgba(209, 252, 0, 0.05)' : 'rgba(0,0,0,0.03)'
    ),
    transform: [{ scale: withTiming(isFocused ? 1.05 : 1) }],
  }));

  return (
    <Animated.View style={[styles.inputBox, animatedStyle]}>
      {children}
    </Animated.View>
  );
};

export const OTPInput: React.FC<OTPInputProps> = ({ value, onChange, length = 6 }) => {
  const inputs = useRef<TextInput[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  const handleChange = (text: string, index: number) => {
    const cleanText = text.replace(/[^0-9]/g, '');
    if (!cleanText && text) return;

    const newValue = value.split('');
    newValue[index] = cleanText;
    const finalValue = newValue.join('');
    onChange(finalValue);

    if (cleanText.length > 0 && index < length - 1) {
      inputs.current[index + 1].focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && index > 0 && !value[index]) {
      inputs.current[index - 1].focus();
    }
  };

  return (
    <View style={styles.container}>
      {Array.from({ length }).map((_, i) => (
        <OTPBox key={i} index={i} isFocused={focusedIndex === i} hasValue={!!value[i]}>
          <TextInput
            ref={(ref) => (inputs.current[i] = ref!)}
            style={styles.input}
            maxLength={1}
            keyboardType="number-pad"
            value={value[i] || ''}
            onChangeText={(text) => handleChange(text, i)}
            onKeyPress={(e) => handleKeyPress(e, i)}
            onFocus={() => setFocusedIndex(i)}
            onBlur={() => setFocusedIndex(-1)}
            selectionColor={Colors.neonLime}
            placeholder="•"
            placeholderTextColor="rgba(0,0,0,0.1)"
          />
        </OTPBox>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginVertical: Spacing.xl,
  },
  inputBox: {
    flex: 1,
    height: 60,
    marginHorizontal: 4,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputBoxFocused: {
    borderColor: Colors.neonLime,
    backgroundColor: 'rgba(209, 252, 0, 0.05)',
  },
  inputBoxFilled: {
    borderColor: 'rgba(0,0,0,0.3)',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  input: {
    color: '#1C1C1E',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
    height: '100%',
  },
});
