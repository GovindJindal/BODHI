import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Video from 'react-native-video';
import SplashScreen from 'react-native-splash-screen';

interface SplashProps {
  onFinish: () => void;
}

export default function VideoSplashScreen({ onFinish }: SplashProps) {
  useEffect(() => {
    // Hide the static native iOS splash screen instantly
    SplashScreen.hide();
  }, []);

  return (
    <View style={styles.container}>
      <Video
        source={require('./images/Logo.mp4')}
        style={styles.video}
        resizeMode="contain"
        onEnd={() => setTimeout(onFinish, 100)}
        repeat={false}
        muted={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '130%',
    height: '130%',
  },
});