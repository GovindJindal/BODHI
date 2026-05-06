import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Colors, Radius, Spacing, FontSize, Shadow, Gradients } from '../../theme/tokens';
import { ChevronRight } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

interface AuthButtonProps {
  title: string;
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  showArrow?: boolean;
  variant?: 'primary' | 'signup';
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export const AuthButton: React.FC<AuthButtonProps> = ({
  title,
  onPress,
  isLoading,
  disabled,
  style,
  textStyle,
  showArrow = true,
  variant = 'primary',
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const getColors = () => {
    if (disabled) return ['#E0E0E0', '#E0E0E0'];
    if (variant === 'signup') return ['#1C1C1E', '#1C1C1E']; 
    return ['#1C1C1E', '#1C1C1E'];
  };

  return (
    <AnimatedTouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || isLoading}
      activeOpacity={1}
      style={[
        styles.container, 
        style, 
        disabled && styles.disabled, 
        animatedStyle
      ]}
    >
      <LinearGradient
        colors={getColors() as (string | number)[]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Text style={[styles.text, textStyle, disabled && styles.disabledText]}>{title}</Text>
            {showArrow && !disabled && (
              <ChevronRight size={20} color="#FFFFFF" style={styles.arrow} />
            )}
          </>
        )}
      </LinearGradient>
    </AnimatedTouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  disabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  gradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  disabledText: {
    color: '#999',
  },
  arrow: {
    position: 'absolute',
    right: 20,
  },
});
