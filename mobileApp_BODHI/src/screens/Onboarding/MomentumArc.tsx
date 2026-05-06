/**
 * MomentumArc.tsx (Minimalist Redesign)
 * BODHI
 */

import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedProps,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const RADIUS = 42; 
const STROKE_WIDTH = 4;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SVG_SIZE = (RADIUS + STROKE_WIDTH) * 2 + 10;
const CENTER = SVG_SIZE / 2;

interface MomentumArcProps {
  scrollOffset: SharedValue<number>;
  totalSteps: number;
}

export const MomentumArc: React.FC<MomentumArcProps> = ({ scrollOffset, totalSteps }) => {
  const arcProps = useAnimatedProps(() => {
    const progress = interpolate(
      scrollOffset.value,
      [0, SCREEN_WIDTH * (totalSteps - 1)],
      [0, 1],
      Extrapolation.CLAMP
    );
    // Ensure there's a starting sliver
    const safeProgress = Math.max(progress, 0.05);
    return {
      strokeDashoffset: CIRCUMFERENCE * (1 - safeProgress),
    };
  });

  return (
    <View style={styles.wrapper}>
      <Svg width={SVG_SIZE} height={SVG_SIZE} style={styles.svg}>
        {/* Outer Track (Light Gray) */}
        <Circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth={STROKE_WIDTH} />
        
        {/* Inner Button (Solid Dark) */}
        <Circle cx={CENTER} cy={CENTER} r={RADIUS - 8} fill="#1C1C1E" />

        {/* Arrow Icon */}
        <Path 
          d="M48 50h14M55 43l7 7-7 7" 
          stroke="#FFFFFF" 
          strokeWidth="3" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
        />

        {/* Progress Arc (Premium Orange) */}
        <AnimatedCircle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="#FF5A00"
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={CIRCUMFERENCE}
          strokeLinecap="round"
          animatedProps={arcProps}
          transform={`rotate(-90, ${CENTER}, ${CENTER})`}
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  svg: { pointerEvents: 'none' },
});