import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import { WebView } from 'react-native-webview';

export interface CandlestickData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Props {
  data: CandlestickData[];
  height?: number;
}

export default function CandlestickChart({ data, height = 250 }: Props) {
  const fontSize = responsiveFont(10);
  const htmlContent = useMemo(() => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <script src="https://unpkg.com/lightweight-charts@3.8.0/dist/lightweight-charts.standalone.production.js"></script>
      <style>
        body { margin: 0; padding: 0; background-color: #0A0A0A; overflow: hidden; }
        #chart { width: 100vw; height: 100vh; }
      </style>
    </head>
    <body>
      <div id="chart"></div>
      <script>
        // Log errors back to React Native
        window.onerror = function(m) {
          window.ReactNativeWebView.postMessage(JSON.stringify({type: 'error', message: m}));
        };

        function init() {
          try {
            const chart = LightweightCharts.createChart(document.getElementById('chart'), {
              width: window.innerWidth,
              height: window.innerHeight,
              layout: { 
                backgroundColor: '#1C1C1E', 
                textColor: 'rgba(255, 255, 255, 0.5)',
                fontSize: ${fontSize},
              },
              grid: { 
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' }, 
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' } 
              },
              timeScale: { borderColor: 'rgba(255, 255, 255, 0.1)' },
              rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' },
              crosshair: { mode: 0 }
            });

            // 🟢 Support for v3 syntax
            const candleSeries = chart.addCandlestickSeries({
              upColor: '#3D4DFF', 
              downColor: '#C83232',
              borderVisible: false, 
              wickUpColor: '#3D4DFF', 
              wickDownColor: '#C83232',
            });

            const chartData = ${JSON.stringify(data)};
            if (chartData && chartData.length > 0) {
              candleSeries.setData(chartData);
              chart.timeScale().fitContent();
            }
          } catch (e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({type: 'error', message: e.message}));
          }
        }
        
        window.onload = init;
      </script>
    </body>
    </html>
  `, [data]);

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg.type === 'error') console.log("📉 CHART ENGINE ERROR:", msg.message);
          } catch(e) {}
        }}
        style={{ backgroundColor: 'transparent' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
});