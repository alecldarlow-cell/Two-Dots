/**
 * Game screen — DEBUG STUB (routing test only, restore full component after confirming route loads)
 *
 * S2 scaffolding: engine state, tap handler, and frame loop are all wired,
 * but the render layer is a placeholder until S3. This file exists so the
 * app boots end-to-end on device — launching `expo start` shows a black
 * screen with a tap target that logs engine events.
 *
 * S3 replaces the placeholder <View> with <Canvas> from @shopify/react-native-skia
 * and moves the per-frame redraw into a Reanimated useFrameCallback.
 */

import { Text, View } from 'react-native';

export default function GameScreen(): React.ReactElement {
  return (
    <View style={{ flex: 1, backgroundColor: '#07070f', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#ffffff', fontSize: 32, letterSpacing: 6 }}>TWO DOTS</Text>
      <Text style={{ color: '#2ECFFF', fontSize: 14, marginTop: 12 }}>tap to start</Text>
    </View>
  );
}
