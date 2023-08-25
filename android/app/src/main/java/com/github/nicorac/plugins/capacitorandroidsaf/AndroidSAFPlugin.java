package com.github.nicorac.plugins.capacitorandroidsaf;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;

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
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Objects;

@CapacitorPlugin(name = "AndroidSAF")
public class AndroidSAFPlugin extends Plugin {

  private static final String ERR_CANCELED = "ERR_CANCELED";
  private static final String ERR_INVALID_URI = "ERR_INVALID_URI";
  private static final String ERR_NOT_FOUND = "ERR_NOT_FOUND";
  private static final String ERR_IO_EXCEPTION = "ERR_IO_EXCEPTION";

  /**
   * Allow client to select a directory and get access to contained files and subfolders
   */
  @PluginMethod()
  public void selectDirectory(PluginCall call) {

    // get input arguments
    String initialUri = call.getString("initialUri", "");

    // open folder selector
    var intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
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
      call.reject(result.toString(), ERR_CANCELED);
      return;
    }

    // extract intent
    Intent intent = result.getData();
    Uri uri = intent.getData();

    // ask for persistent access
    int takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
    getContext().getContentResolver().takePersistableUriPermission(uri, takeFlags);

    // Do something with the result data
    var ret = new JSObject();
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
      call.reject("Invalid uri", ERR_INVALID_URI);
      return;
    }

    // Get a DocumentFile from the given Uri
    var uri = Uri.parse(uriString);
    var folder = DocumentFile.fromTreeUri(getContext(), uri);
    if (!folder.exists()) {
      call.reject("Folder not found", ERR_NOT_FOUND);
      return;
    }

    // return files list
    try {
      var ret = new JSObject();
      ret.put("items", this.listFileFaster(folder.getUri()));
      call.resolve(ret);
    }
    catch (Exception e) {
      call.reject("Error retrieving files list", ERR_IO_EXCEPTION, e);
    }

  }

  /**
   * Load and return file content
   *
   * @param call
   *  call.uri: URI of the file to read
   */
  @PluginMethod()
  public void readFile(PluginCall call) {

    // get input arguments
    var fileUri = call.getString("uri", null);
    if (fileUri == null) {
      call.reject("Invalid or missing uri", ERR_INVALID_URI);
      return;
    }

    // if an "encoding" has been specified, file content is returned as string
    // otherwise it's returned as BASE64 string
    var encoding = call.getString("encoding", null);
    var charset = getEncoding(encoding);

    // Get a DocumentFile from the given fileUri
    var uri = Uri.parse(fileUri);
    var file = DocumentFile.fromSingleUri(getContext(), uri);
    if (!file.exists()) {
      call.reject("File not found", ERR_NOT_FOUND);
      return;
    }

    // load file content
    String content = "";
    try (
      var is = getContext().getContentResolver().openInputStream(uri);
    ) {
      content = charset != null
        ? readFileAsString(is, charset.name())
        : readFileAsBase64EncodedData(is);
    }
    catch (FileNotFoundException e) {
      call.reject(e.toString(), ERR_NOT_FOUND);
      return;
    } catch (IOException e) {
      call.reject(e.toString(), ERR_IO_EXCEPTION);
      return;
    }

    // return file content
    var ret = new JSObject();
    ret.put("encoding", encoding);
    ret.put("content", content);
    call.resolve(ret);

  }

  /**
   * Delete file
   *
   * @param call
   *  call.uri: URI of the file to delete
   */
  @PluginMethod()
  public void deleteFile(PluginCall call) {

    // get input arguments
    String fileUri = call.getString("uri", null);
    if (fileUri == null) {
      call.reject("Invalid or missing uri", ERR_INVALID_URI);
      return;
    }

    // Get a DocumentFile from the given fileUri
    var uri = Uri.parse(fileUri);
    var file = DocumentFile.fromSingleUri(getContext(), uri);
    if (!file.exists()) {
      call.reject("File not found", ERR_NOT_FOUND);
      return;
    }

    // delete file
    var res = file.delete();
    if (res) {
      call.resolve();
    }
    else {
      call.reject("Error deleting file", ERR_IO_EXCEPTION);
    }

  }

  /**
   * More efficient method to retrieve directory content, avoiding calls to
   * slow DocumentFile methods like .getDisplayName()
   *
   * @see https://stackoverflow.com/questions/42186820/why-is-documentfile-so-slow-and-what-should-i-use-instead
   *
   * @param folderUri URI of the folder to be scanned
   *
   * @return JSArray of JSObject items, ready to be returned to JS
   */
  private JSArray listFileFaster(Uri folderUri) {

    final ContentResolver resolver = getContext().getContentResolver();
    final Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(folderUri, DocumentsContract.getDocumentId(folderUri));
    final var result = new JSArray();
    Cursor c;

    // load all of the needed data in a single shot
    c = resolver.query(
      childrenUri,
      new String[] {
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,    // 0
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,   // 1
        DocumentsContract.Document.COLUMN_MIME_TYPE,      // 2
        DocumentsContract.Document.COLUMN_FLAGS,          // 3
        DocumentsContract.Document.COLUMN_SIZE,           // 4
        DocumentsContract.Document.COLUMN_LAST_MODIFIED,  // 5
      }, null, null, null);
    while (c.moveToNext()) {
      final var item = new JSObject();
      final var documentId = c.getString(0);
      final var mimeType = c.getString(2);
      final var flags = c.getInt(3);

      item.put("name", c.getString(1));
      item.put("uri", DocumentsContract.buildDocumentUriUsingTree(folderUri, documentId).toString());
      item.put("type", mimeType);
      item.put("isDirectory", mimeType == DocumentsContract.Document.MIME_TYPE_DIR);
      item.put("isVirtual", flags & DocumentsContract.Document.FLAG_VIRTUAL_DOCUMENT);
      item.put("size", c.getLong(4));
      item.put("lastModified", c.getLong(5));

      // append to result
      result.put(item);
    }

    return result;
  }

  /****************************************************************************
   * The code below comes from Filesystem Capacitor plugin (with some changes)
   ****************************************************************************/
  public Charset getEncoding(String encoding) {
    if (encoding == null) {
      return null;
    }
    switch (encoding) {
      case "utf8":
        return StandardCharsets.UTF_8;
      case "utf16":
        return StandardCharsets.UTF_16;
      case "ascii":
        return StandardCharsets.US_ASCII;
    }
    return null;
  }

  /**
   * Utility function to read file content as string (with the given encoding)
   */
  private String readFileAsString(InputStream is, String encoding) throws IOException {
    var outputStream = new ByteArrayOutputStream();
    byte[] buffer = new byte[1024];
    int length = 0;

    while ((length = is.read(buffer)) != -1) {
      outputStream.write(buffer, 0, length);
    }
    return outputStream.toString(encoding);
  }

  /**
   * Utility function to read file content as BASE64 string
   */
  private String readFileAsBase64EncodedData(InputStream is) throws IOException {
    var fileInputStreamReader = (FileInputStream) is;
    ByteArrayOutputStream byteStream = new ByteArrayOutputStream();
    byte[] buffer = new byte[1024];
    int c;

    while ((c = fileInputStreamReader.read(buffer)) != -1) {
      byteStream.write(buffer, 0, c);
    }
    fileInputStreamReader.close();
    return Base64.encodeToString(byteStream.toByteArray(), Base64.NO_WRAP);
  }

}
