/**
 * OnboardingScreen.tsx (Minimalist Redesign)
 * BODHI
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { GlassCard, OnboardingStep } from './GlassCard';
import { MomentumArc } from './MomentumArc';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STEPS: OnboardingStep[] = [
  {
    id: 0,
    title: 'Money that moves\nwith you',
    subtitle: 'Track group expenses, settle trips instantly, and manage your insurance policies—all in one place.',
    image: require('../../assets/images/step0_travel.png'), 
    accentColor: '#111827',
  },
  {
    id: 1,
    title: 'Micro-Investment\nClubs',
    subtitle: 'Pool funds with your friends to invest together. Vote on trades, split the profits, and grow as a squad.',
    image: require('../../assets/images/step1_invest.png'),
    accentColor: '#111827',
  },
  {
    id: 2,
    title: 'Your Financial\nAssistant',
    subtitle: 'A proactive AI that runs invisibly in the background. And you can ask anything about your money, anytime.',
    image: require('../../assets/images/step2_ai.png'),
    accentColor: '#111827',
  },
  {
    id: 3,
    title: 'Simulate &\nExecute',
    subtitle: 'Master the markets with our simulator, then execute live trades directly to the exchange with pure momentum.',
    image: require('../../assets/images/step3_trade.png'),
    accentColor: '#111827',
  },
];

export const OnboardingScreen = ({ onFinish }: { onFinish: () => void }) => {
  const scrollOffset = useSharedValue(0);
  const flatListRef = useRef<Animated.FlatList<OnboardingStep>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.value = event.contentOffset.x;
      const index = Math.round(event.contentOffset.x / SCREEN_WIDTH);
      if (currentIndex !== index) {
        runOnJS(setCurrentIndex)(index);
      }
    },
  });

  const handleNext = useCallback(() => {
    if (currentIndex < STEPS.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      onFinish();
    }
  }, [currentIndex, onFinish]);

  return (
    <View style={styles.container}>
      {/* Light background means dark status bar text */}
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* Header with Skip Button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onFinish} activeOpacity={0.6} hitSlop={{top: 20, bottom: 20, left: 20, right: 20}}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <Animated.FlatList
        ref={flatListRef}
        data={STEPS}
        keyExtractor={(item) => item.id.toString()}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => (
          <GlassCard step={item} index={index} scrollOffset={scrollOffset} />
        )}
      />

      <View style={styles.bottomHUD}>
        <View style={styles.arcContainer}>
          <MomentumArc scrollOffset={scrollOffset} totalSteps={STEPS.length} />
          {/* The button is now invisible on top of the SVG, handling the touch area */}
          <TouchableOpacity style={styles.actionButton} activeOpacity={0.8} onPress={handleNext} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFDF9' }, // Pure white-ish background
  header: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 32, paddingTop: Platform.OS === 'ios' ? 60 : 40, zIndex: 10 },
  skipText: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  bottomHUD: { position: 'absolute', bottom: Platform.OS === 'ios' ? 50 : 30, width: '100%', alignItems: 'center' },
  arcContainer: { alignItems: 'center', justifyContent: 'center', width: 100, height: 100 },
  actionButton: { position: 'absolute', width: 70, height: 70, borderRadius: 35 },
});