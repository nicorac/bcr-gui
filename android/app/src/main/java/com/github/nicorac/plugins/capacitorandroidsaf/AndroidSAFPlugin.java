package com.github.nicorac.plugins.capacitorandroidsaf;

import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;
import androidx.appcompat.app.AppCompatActivity;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.Objects;

@CapacitorPlugin(name = "AndroidSAF")
public class AndroidSAFPlugin extends Plugin {

  /**
   * Allow client to select a directory and get access to contained files and subfolders
   */
  @PluginMethod()
  public void selectDirectory(PluginCall call) {

    // get input arguments
    String initialUri = call.getString("initialUri", "");

    // open folder selector
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
    if (initialUri != "") {
      intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, initialUri);
    }

    // start activity
    startActivityForResult(call, intent, "selectDirectoryResult");

  }

  @ActivityCallback()
  private void selectDirectoryResult(PluginCall call, ActivityResult result) {

    if (call == null) {
      return;
    }

    if (result.getResultCode() != AppCompatActivity.RESULT_OK) {
      call.reject(result.toString());
      return;
    }

    // extract intent
    Intent intent = result.getData();
    Uri uri = intent.getData();

    // ask for persistent access
    int takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
    getContext().getContentResolver().takePersistableUriPermission(uri, takeFlags);

    // Do something with the result data
    JSObject ret = new JSObject();
    ret.put("selectedUri", intent.getDataString());
    call.resolve(ret);

  }

  /**
   * Return an array of filenames contained in the given folder Uri
   */
  @PluginMethod()
  public void listFiles(PluginCall call) {

    // get input arguments
    String uriString = call.getString("uri", "");
    if (uriString == "") {
      call.reject("Invalid uri");
      return;
    }

    // Get a DocumentFile from the given TreeUri
    var uri = Uri.parse(uriString);
    var folder = DocumentFile.fromTreeUri(getContext(), uri);
    if (!folder.exists()) {
      call.reject("Invalid uri");
      return;
    }

    // compose result array
    var items = new JSArray();
    for (var item : folder.listFiles()) {
      JSObject child = new JSObject();
      child.put("name", item.getName());
      child.put("uri", item.getUri().toString());
      child.put("type", item.getType());
      child.put("isDirectory", item.isDirectory());
      child.put("isFile", item.isFile());
      child.put("isVirtual", item.isVirtual());
      child.put("size", item.length());
      child.put("lastModified", item.lastModified());
      items.put(child);
    }

    // return
    JSObject ret = new JSObject();
    ret.put("items", items);
    call.resolve(ret);

  }


  /**
   * Load and return file content
   *
   * @param call
   *  call.fileUri: URI of the file to read
   */
  @PluginMethod()
  public void readFile(PluginCall call) {

    // get input arguments
    String fileUri = call.getString("uri", null);
    if (fileUri == null) {
      call.reject("Invalid or missing uri");
      return;
    }

    // Get a DocumentFile from the given TreeUri
    var uri = Uri.parse(fileUri);
    var file = DocumentFile.fromSingleUri(getContext(), uri);
    if (!file.exists()) {
      call.reject("File does not exist");
      return;
    }

    // load file content
    StringBuilder stringBuilder = new StringBuilder();
    try (InputStream inputStream = getContext().getContentResolver().openInputStream(uri);
         BufferedReader reader = new BufferedReader(new InputStreamReader(Objects.requireNonNull(inputStream)))) {
      String line;
      while ((line = reader.readLine()) != null) {
        stringBuilder.append(line);
      }
    }
    catch (FileNotFoundException e) {
      call.reject(e.toString());
      return;
    } catch (IOException e) {
      call.reject(e.toString());
      return;
    }

    // return file content
    JSObject ret = new JSObject();
    ret.put("content", stringBuilder.toString());
    call.resolve(ret);

  }

}
