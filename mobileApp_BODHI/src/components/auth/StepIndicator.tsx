import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '../../theme/tokens';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep, totalSteps }) => {
  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            currentStep >= i && styles.dotActive,
            currentStep === i && styles.dotCurrent
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxxl,
    gap: 8,
  },
  dot: {
    height: 6,
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: Radius.full,
  },
  dotActive: {
    backgroundColor: Colors.neonLime,
  },
  dotCurrent: {
    backgroundColor: Colors.neonLime,
    shadowColor: Colors.neonLime,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 8,
  },
});
