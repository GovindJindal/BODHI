import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
  Platform,
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { X, Delete, Divide, Minus, Plus, Equal, Percent, Hash } from 'lucide-react-native';
import { Colors, Radius, Spacing, Shadow } from '../theme/tokens';
import { useCalculator } from '../context/CalculatorContext';
import { BlurView } from '@react-native-community/blur';

const { width: W, height: H } = Dimensions.get('window');

const CALC_WIDTH = 280;
const CALC_HEIGHT = 400;
const MIN_WIDTH = 220;
const MIN_HEIGHT = 300;
const MAX_WIDTH = W - 40;
const MAX_HEIGHT = H - 100;

export const FloatingCalculator = () => {
  const { isCalculatorVisible, hideCalculator } = useCalculator();
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');

  // Use refs for size so PanResponders always have current values
  const sizeRef = useRef({ width: CALC_WIDTH, height: CALC_HEIGHT });
  const widthAnim = useRef(new Animated.Value(CALC_WIDTH)).current;
  const heightAnim = useRef(new Animated.Value(CALC_HEIGHT)).current;

  // Force re-render when size changes (for button layout)
  const [, forceUpdate] = useState(0);

  // ── Drag (move) PanResponder ──────────────────────────────────────────
  const pan = useRef(new Animated.ValueXY({ x: W - CALC_WIDTH - 20, y: H - CALC_HEIGHT - 100 })).current;

  const dragPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,
      onPanResponderGrant: () => {
        pan.setOffset({
          // @ts-ignore
          x: pan.x._value,
          // @ts-ignore
          y: pan.y._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false },
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    }),
  ).current;

  // ── Resize PanResponder ───────────────────────────────────────────────
  const resizePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_evt, gs) => {
        const s = sizeRef.current;
        const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, s.width + gs.dx));
        const newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, s.height + gs.dy));
        widthAnim.setValue(newW);
        heightAnim.setValue(newH);
      },
      onPanResponderRelease: (_evt, gs) => {
        const s = sizeRef.current;
        const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, s.width + gs.dx));
        const newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, s.height + gs.dy));
        sizeRef.current = { width: newW, height: newH };
        widthAnim.setValue(newW);
        heightAnim.setValue(newH);
        forceUpdate(n => n + 1);
      },
    }),
  ).current;

  if (!isCalculatorVisible) return null;

  const handlePress = (val: string) => {
    if (val === 'C') {
      setDisplay('0');
      setExpression('');
      return;
    }

    if (val === '=') {
      try {
        const cleanDisplay = display.replace(/×/g, '*').replace(/÷/g, '/');
        if (/^[0-9+\-*/.%() ]+$/.test(cleanDisplay)) {
          const result = Function(`'use strict'; return (${cleanDisplay})`)();
          setExpression(display + ' =');
          setDisplay(String(result));
        } else {
          setDisplay('Error');
        }
      } catch (e) {
        setDisplay('Error');
      }
      return;
    }

    if (display === '0' || display === 'Error') {
      setDisplay(val);
    } else {
      setDisplay(display + val);
    }
  };

  const deleteLast = () => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  const CalcButton = ({ label, onPress, type = 'num', icon: Icon }: any) => {
    const isAction = type === 'action';
    const isEqual = type === 'equal';

    return (
      <TouchableOpacity
        style={[
          styles.btn,
          isAction && styles.btnAction,
          isEqual && styles.btnEqual
        ]}
        onPress={onPress}
      >
        {Icon ? (
          <Icon size={20} color={isEqual ? '#000' : '#FFF'} />
        ) : (
          <Text style={[styles.btnText, isEqual && { color: '#000' }]}>{label}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: widthAnim,
          height: heightAnim,
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
      ]}
    >
      {/* Blur background – non-interactive */}
      <BlurView
        style={StyleSheet.absoluteFill}
        blurType="dark"
        blurAmount={20}
        overlayColor="transparent"
        pointerEvents="none"
      />

      {/* Drag handle header */}
      <View style={styles.header} {...dragPanResponder.panHandlers}>
        <View style={styles.dragIndicator} />
        <TouchableOpacity onPress={hideCalculator} style={styles.closeBtn}>
          <X size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      <View style={styles.displayArea}>
        <Text style={styles.expressionText} numberOfLines={1}>{expression}</Text>
        <Text style={styles.displayText} numberOfLines={1} adjustsFontSizeToFit>{display}</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.row}>
          <CalcButton label="C" onPress={() => handlePress('C')} type="action" />
          <CalcButton label="÷" onPress={() => handlePress('÷')} icon={Divide} type="action" />
          <CalcButton label="×" onPress={() => handlePress('×')} icon={X} type="action" />
          <CalcButton label="⌫" onPress={deleteLast} icon={Delete} type="action" />
        </View>
        <View style={styles.row}>
          <CalcButton label="7" onPress={() => handlePress('7')} />
          <CalcButton label="8" onPress={() => handlePress('8')} />
          <CalcButton label="9" onPress={() => handlePress('9')} />
          <CalcButton label="-" onPress={() => handlePress('-')} icon={Minus} type="action" />
        </View>
        <View style={styles.row}>
          <CalcButton label="4" onPress={() => handlePress('4')} />
          <CalcButton label="5" onPress={() => handlePress('5')} />
          <CalcButton label="6" onPress={() => handlePress('6')} />
          <CalcButton label="+" onPress={() => handlePress('+')} icon={Plus} type="action" />
        </View>
        <View style={styles.row}>
          <CalcButton label="1" onPress={() => handlePress('1')} />
          <CalcButton label="2" onPress={() => handlePress('2')} />
          <CalcButton label="3" onPress={() => handlePress('3')} />
          <CalcButton label="%" onPress={() => handlePress('%')} icon={Percent} type="action" />
        </View>
        <View style={styles.row}>
          <CalcButton label="0" onPress={() => handlePress('0')} />
          <CalcButton label="." onPress={() => handlePress('.')} />
          <CalcButton label="=" onPress={() => handlePress('=')} icon={Equal} type="equal" />
        </View>
      </View>

      {/* ── Resize Grip (bottom-right corner) ── */}
      <View
        style={styles.resizeHandle}
        {...resizePanResponder.panHandlers}
      >
        <View style={styles.resizeGrip}>
          <View style={[styles.gripLine, { width: 16, marginBottom: 3 }]} />
          <View style={[styles.gripLine, { width: 10, marginBottom: 3 }]} />
          <View style={[styles.gripLine, { width: 5 }]} />
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    zIndex: 9999,
    padding: Spacing.md,
    ...Shadow.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    height: 28,
  },
  dragIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  closeBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 4,
  },
  displayArea: {
    height: 80,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.md,
  },
  expressionText: {
    fontSize: responsiveFont(14),
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 4,
  },
  displayText: {
    fontSize: responsiveFont(36),
    color: '#FFF',
    fontWeight: '700',
  },
  grid: {
    flex: 1,
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  btn: {
    width: '22%',
    aspectRatio: 1.2,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAction: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  btnEqual: {
    backgroundColor: Colors.neonLime,
    flex: 1,
    marginLeft: Spacing.xs,
    aspectRatio: undefined,
  },
  btnText: {
    fontSize: responsiveFont(18),
    color: '#FFF',
    fontWeight: '600',
  },
  // ── Resize Handle ──
  resizeHandle: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingRight: 6,
    paddingBottom: 6,
  },
  resizeGrip: {
    alignItems: 'flex-end',
  },
  gripLine: {
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
});
