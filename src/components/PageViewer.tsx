import { Pressable, Text, useTheme } from '@basalt/core';
import { X } from 'lucide-react-native';
import React, { useState } from 'react';
import { FlatList, Modal, View, useWindowDimensions } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PageRow } from '../lib/db';
import { PageImage } from './PageImage';

/** Full-screen, swipeable page viewer on a black background. */
export function PageViewer({ pages, start, onClose }: { pages: PageRow[]; start: number; onClose: () => void }) {
  const { spacing } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(start);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <FlatList
          data={pages}
          horizontal
          pagingEnabled
          initialScrollIndex={start}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={onScroll}
          keyExtractor={(p) => p.name}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={{ width, height, justifyContent: 'center' }}>
              <PageImage name={item.name} style={{ width, height: height * 0.86 }} fit="contain" />
            </View>
          )}
        />
        <View style={{ position: 'absolute', top: insets.top + spacing.sm, left: spacing.lg, right: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="label" style={{ color: '#fff' }}>
            Page {index + 1} of {pages.length}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close viewer" hitSlop={12} onPress={onClose} style={{ padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' }}>
            <X size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
