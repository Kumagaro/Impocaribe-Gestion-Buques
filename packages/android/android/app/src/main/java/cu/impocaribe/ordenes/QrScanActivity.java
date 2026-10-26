package cu.impocaribe.ordenes;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ExperimentalGetImage;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * T118 · P-01 y RF-RED-03: lee el QR de emparejamiento que muestra la PC servidor, con la cámara trasera y ML Kit con
 * el modelo dentro del APK (sin Play Store, R-10, decisión del responsable del 2026-10-26). Devuelve el texto del
 * primer QR que lee; la interfaz comprueba que sea de un servidor de la empresa.
 */
public class QrScanActivity extends AppCompatActivity {
    public static final String EXTRA_TEXT = "impocaribe.qr.text";

    private final ExecutorService analysis = Executors.newSingleThreadExecutor();
    private BarcodeScanner scanner;
    private boolean done;

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        PreviewView preview = new PreviewView(this);
        root.addView(preview, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        TextView hint = new TextView(this);
        hint.setText("Apunte al QR que muestra la PC servidor");
        hint.setTextColor(Color.WHITE);
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        hint.setGravity(Gravity.CENTER);
        hint.setBackgroundColor(0x99000000);
        hint.setPadding(dp(16), dp(14), dp(16), dp(14));
        FrameLayout.LayoutParams top = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        root.addView(hint, top);

        Button cancel = new Button(this);
        cancel.setText("Cancelar");
        cancel.setOnClickListener(v -> finish());
        FrameLayout.LayoutParams bottom = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dp(52), Gravity.BOTTOM);
        bottom.setMargins(dp(16), 0, dp(16), dp(24));
        root.addView(cancel, bottom);
        setContentView(root);

        scanner = BarcodeScanning.getClient(new BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build());
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                ProcessCameraProvider provider = future.get();
                Preview p = new Preview.Builder().build();
                p.setSurfaceProvider(preview.getSurfaceProvider());
                ImageAnalysis frames = new ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build();
                frames.setAnalyzer(analysis, this::read);
                provider.unbindAll();
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, p, frames);
            } catch (Exception e) {
                hint.setText("No se pudo abrir la cámara. Escriba la dirección del servidor a mano.");
            }
        }, ContextCompat.getMainExecutor(this));
    }

    @OptIn(markerClass = ExperimentalGetImage.class)
    private void read(ImageProxy frame) {
        if (done || frame.getImage() == null) {
            frame.close();
            return;
        }
        InputImage image = InputImage.fromMediaImage(frame.getImage(), frame.getImageInfo().getRotationDegrees());
        scanner
            .process(image)
            .addOnSuccessListener(codes -> {
                for (Barcode code : codes) {
                    String text = code.getRawValue();
                    if (text != null && !done) {
                        done = true;
                        setResult(RESULT_OK, new Intent().putExtra(EXTRA_TEXT, text));
                        finish();
                        return;
                    }
                }
            })
            .addOnCompleteListener(t -> frame.close());
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        analysis.shutdown();
        if (scanner != null) scanner.close();
    }
}
