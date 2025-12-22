import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { MapType } from 'react-native-maps';

type MapContextType = {
  mapType: MapType;
  setMapType: (type: MapType) => void;
};

const MapContext = createContext<MapContextType>({
  mapType: 'hybrid',
  setMapType: () => {},
});

export const useMapType = () => useContext(MapContext);

export const MapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mapType, setMapTypeState] = useState<MapType>('hybrid');

  useEffect(() => {
    loadMapType();
  }, []);

  const loadMapType = async () => {
    try {
      const savedType = await AsyncStorage.getItem('mapType_v2'); // Changed key to force reset to default
      if (savedType) {
        setMapTypeState(savedType as MapType);
      }
    } catch (error) {
      console.error('Failed to load map type:', error);
    }
  };

  const setMapType = async (type: MapType) => {
    try {
      setMapTypeState(type);
      await AsyncStorage.setItem('mapType_v2', type);
    } catch (error) {
      console.error('Failed to save map type:', error);
    }
  };

  return (
    <MapContext.Provider value={{ mapType, setMapType }}>
      {children}
    </MapContext.Provider>
  );
};
