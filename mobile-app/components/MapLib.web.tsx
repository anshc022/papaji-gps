import React from 'react';
import { Text, View } from 'react-native';

const MapView = (props: any) => (
  <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3f4f6'}}>
    <Text style={{fontSize: 18, fontWeight: 'bold', color: '#1f2937', marginBottom: 8}}>
      🚜 Papaji GPS
    </Text>
    <Text style={{fontSize: 16, color: '#4b5563'}}>
      Map is available on Android & iOS
    </Text>
    <Text style={{fontSize: 14, color: '#6b7280', marginTop: 4}}>
      Please open in Expo Go app
    </Text>
  </View>
);

export default MapView;
export const Marker = (props: any) => null;
export const PROVIDER_GOOGLE = 'google';
export const Callout = (props: any) => null;
