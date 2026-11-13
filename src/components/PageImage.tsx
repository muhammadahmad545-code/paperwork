import { useTheme } from '@basalt/core';
import { FileText } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';
import { Native } from '../lib/capture';

/** Decrypts a stored page on demand and shows it. */
export function PageImage({ name, style }: { name: string | null; style: StyleProp<ImageStyle> }) {
  const { colors } = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setUri(null);
    setFailed(false);
    if (!name) return;
    Native.openPage(name)
      .then((u) => alive && setUri(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [name]);
  if (uri) return <Image source={{ uri }} style={style} resizeMode="cover" accessibilityIgnoresInvertColors />;
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised }, style as object]}>
      {name && !failed ? <ActivityIndicator color={colors.accent} /> : <FileText size={22} color={colors.textFaint} />}
    </View>
  );
}
