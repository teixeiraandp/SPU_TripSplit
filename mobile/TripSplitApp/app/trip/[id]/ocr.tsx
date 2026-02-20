import React, { useState } from "react";
import { Button, ScrollView, StyleSheet, View, Text } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import MlkitOcr from "react-native-mlkit-ocr";

type OcrPiece = { text: string; top: number; left: number; height: number };

const topOf = (b: any) => b?.bounding?.top ?? b?.bounds?.top ?? 0;
const leftOf = (b: any) => b?.bounding?.left ?? b?.bounds?.left ?? 0;
const heightOf = (b: any) => b?.bounding?.height ?? b?.bounds?.height ?? 0;

export default function OcrScreen() {
  const [ocrText, setOcrText] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);

  const runOcr = async (uri: string) => {
    setOcrText("Running OCR...");

    try {
      const blocks: any[] = await MlkitOcr.detectFromUri(uri);
      console.log("OCR blocks:", blocks?.length);

      const pieces: OcrPiece[] = [];

      for (const b of blocks ?? []) {
        if (b?.lines?.length) {
          for (const ln of b.lines) {
            const t = (ln?.text ?? "").trim();
            if (!t) continue;
            pieces.push({ text: t, top: topOf(ln), left: leftOf(ln), height: heightOf(ln) });
          }
        } else {
          const t = (b?.text ?? "").trim();
          if (!t) continue;
          pieces.push({ text: t, top: topOf(b), left: leftOf(b), height: heightOf(b) });
        }
      }

      // Sort top-to-bottom then left-to-right
      pieces.sort((a, c) => (a.top - c.top) || (a.left - c.left));

      // Merge into lines
      const lines: string[] = [];
      let current: { y: number; h: number; parts: Array<{ left: number; text: string }> } | null = null;

      for (const p of pieces) {
        if (!current) {
          current = { y: p.top, h: p.height || 24, parts: [{ left: p.left, text: p.text }] };
          continue;
        }

        const tol = Math.max(12, Math.round((current.h || 24) * 0.6));

        if (Math.abs(current.y - p.top) <= tol) {
          current.parts.push({ left: p.left, text: p.text });
          current.h = Math.max(current.h, p.height || 0);
        } else {
          current.parts.sort((x, y) => x.left - y.left);
          lines.push(current.parts.map(k => k.text).join(" "));
          current = { y: p.top, h: p.height || 24, parts: [{ left: p.left, text: p.text }] };
        }
      }
      // The final line to add
      if (current) {
        current.parts.sort((x, y) => x.left - y.left);
        lines.push(current.parts.map(k => k.text).join(" "));
      }

      const finalText = lines.join("\n").trim();
      setOcrText(finalText.length ? finalText : "No text found.");
    } catch (e: any) {
      setOcrText("OCR failed: " + (e?.message ?? String(e)));
    }
    
  };
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      setOcrText("Camera permission denied.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
      allowsEditing: true,
    });

    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setImageUri(uri);
    await runOcr(uri);
  };

  const pickFromAlbum = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      setOcrText("Photo library permission denied.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsEditing: true,
    });

    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setImageUri(uri);
    await runOcr(uri);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>OCR Test</Text>

      <Button title="Take Receipt Photo (Camera)" onPress={takePhoto} />
      <View style={{ height: 10 }} />
      <Button title="Pick Receipt From Album" onPress={pickFromAlbum} />

      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          contentFit="contain"
        />
      ) : null}

      <ScrollView style={styles.scroll}>
        <Text selectable style={styles.text}>{ocrText}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 14, gap: 10 },
  title: { fontSize: 20, fontWeight: "700" },
  image: { width: "100%", height: 240, marginTop: 10, borderRadius: 12 },
  scroll: { marginTop: 10, borderWidth: 1, borderRadius: 10, padding: 10, maxHeight: 320 },
  text: { fontSize: 14, lineHeight: 18 },

  
});
