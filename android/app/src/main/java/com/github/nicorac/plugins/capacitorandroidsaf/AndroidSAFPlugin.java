package com.github.nicorac.plugins.capacitorandroidsaf;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.util.JsonWriter;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStreamWriter;
import java.io.StringWriter;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Objects;

@CapacitorPlugin(name = "AndroidSAF")
public class AndroidSAFPlugin extends Plugin {

  private static final String ERR_CANCELED = "ERR_CANCELED";
  private static final String ERR_INVALID_URI = "ERR_INVALID_URI";
  private static final String ERR_INVALID_CONTENT = "ERR_INVALID_CONTENT";
  private static final String ERR_INVALID_NAME = "ERR_INVALID_NAME";
  private static final String ERR_NOT_FOUND = "ERR_NOT_FOUND";
  private static final String ERR_IO_EXCEPTION = "ERR_IO_EXCEPTION";
  private static final String ERR_UNKNOWN = "ERR_UNKNOWN";

  /**
   * Allow client to select a directory and get access to contained files and subdirectorys
   */
  @PluginMethod()
  public void selectDirectory(PluginCall call) {

    // get input arguments
    String initialUri = call.getString("initialUri", "");

    // open directory selector
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
   * Allow client to select a file and get access to it
   */
  @PluginMethod()
  public void selectFile(PluginCall call) {

    // get input arguments
    String initialUri = call.getString("initialUri", "");

    // open file
    var intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.setType("*/*");
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    if (initialUri != "") {
      intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, initialUri);
    }

    // start activity
    startActivityForResult(call, intent, "selectFileResult");

  }

  @ActivityCallback()
  private void selectFileResult(PluginCall call, ActivityResult result) {

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

    // get DocumentFile from selected file
    var fileDf = DocumentFile.fromSingleUri(getContext(), uri);

    // Do something with the result data
    var ret = new JSObject();
    ret.put("selectedUri", intent.getDataString());
    ret.put("displayName", fileDf.getName());
    call.resolve(ret);

  }

  /**
   * Return the JSON serialized version of IDocumentFile items contained in the given directory Uri
   */
  @PluginMethod()
  public void listFiles(PluginCall call) {

    // get directory param
    var directoryDF = getDirectoryDfFromCall(call);
    if (directoryDF == null) return;

    // return files list
    try {
      var res = new JSObject();
      res.put("itemsJson", this.listFileFaster(directoryDF.getUri()));
      call.resolve(res);
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

    // Get a DocumentFile from the given "directory" and "filename" params
    var fileDF = getFileDfFromCall(call);
    if (fileDF == null) return;

    // if an "encoding" has been specified, file content is passed as string
    // otherwise it's passed as BASE64 string
    var encoding = call.getString("encoding", null);
    var charset = getEncoding(encoding);

    // load file content
    String content;
    try (
      var is = getContext().getContentResolver().openInputStream(fileDF.getUri())
    ) {
      if (charset != null) {
        assert is != null;
        content = readFileAsString(is, charset.name());
      } else {
        content = readFileAsBase64EncodedData(is);
      }
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
   * Create a new file and write content
   *
   * @param call
   *  call.directoryUri: URI of the directory that will contain the new file
   *  call.name: new filename
   *
   */
  @PluginMethod()
  public void createFile(PluginCall call) {

    // get fileUri param
    var dirDF = getDirectoryDfFromCall(call);
    if (dirDF == null) return;

    var filename = call.getString("name", null);
    if (filename == null || filename.isBlank()) {
      call.reject("Invalid filename", ERR_INVALID_NAME);
      return;
    }

    // create a file with proper mimeType
    var fileDF = dirDF.createFile(getMimeType(filename), filename);
    if (fileDF == null) {
      call.reject("Error creating file", ERR_IO_EXCEPTION);
      return;
    };

    // call writeFile() passing the created fileDF
    _writeFile(call, fileDF);

  }

  /**
   * Write content to an existing file or create a new file
   *
   * @param call
   *  call.fileUri: URI of the EXISTING file to be overwritten
   *
   */
  @PluginMethod()
  public void writeFile(PluginCall call) {

    var fileDF = getFileDfFromCall(call);
    if (fileDF == null) return;

    _writeFile(call, getFileDfFromCall(call));

  }

  private void _writeFile(PluginCall call, @Nullable DocumentFile fileDF) {

    // if an "encoding" has been specified, file content is passed as string
    // otherwise it's passed as BASE64 string
    var encoding = call.getString("encoding", null);
    var charset = getEncoding(encoding);

    // Get content
    var content = call.getString("content", null);
    if (content == null) {
      call.reject("Invalid or missing content", ERR_INVALID_CONTENT);
      return;
    }

    // write content (and resolve/reject call)
    try {
      _writeFileContent(fileDF.getUri(), content, charset);
      call.resolve(new JSObject().put("fileUri", fileDF.getUri()));
    } catch (IOException e) {
      call.reject("Error writing to file", ERR_IO_EXCEPTION);
    }

  }

  /**
   * Write file content to existing file with the given URI
   */
  private void _writeFileContent(Uri uri, String content, Charset charset) throws IOException {
    try (
      var os = getContext().getContentResolver().openOutputStream(uri, "wt")
    ) {
      assert os != null;
      // if charset is not null assume its a plain text file the user wants to save
      if (charset != null) {
        try (
          var osw = new OutputStreamWriter(os, charset);
        ) {
          osw.write(content);
          osw.flush();
        }
      }
      else {
        // remove header from dataURL
        if (content.contains(",")) {
          content = content.split(",")[1];
        }
        os.write(Base64.decode(content, Base64.NO_WRAP));
      }
    }
  }

  /**
   * Delete file
   * No error is emitted in case file does not exist.
   */
  @PluginMethod()
  public void deleteFile(PluginCall call) {

    // get file from "fileUri" param
    var fileDF = getFileDfFromCall(call);

    // delete file
    if (fileDF != null && !fileDF.delete()) {
      call.reject("Error deleting file", ERR_IO_EXCEPTION);
    }
    else {
      call.resolve();
    }
  }

  /**
   * Get the URI of a single file searching it by DisplayName in the given directory.
   * Returns a null uri in case file is not available.
   */
  @PluginMethod()
  public void getFileUri(PluginCall call) {

    // get directory params
    var dirDf = getDirectoryDfFromCall(call);
    if (dirDf == null) return;

    // get filename
    var filename = call.getString("name", null);
    if (filename == null || filename.isEmpty()) {
      call.reject("Invalid filename", ERR_INVALID_NAME);
      return;
    }

    // call findFileFaster()
    var fileUri = findFileFaster(dirDf, filename);

    // return URI
    var ret = new JSObject();
    ret.put("uri", fileUri != null ? fileUri.toString() : null);
    call.resolve(ret);

  }

  /**
   * More efficient method to find a file, avoiding calls to
   * slow DocumentFile methods like .getDisplayName()
   *
   * BEWARE: can't filter results of getContentResolver().query(), so it could be slow for crowded directories...
   *
   * @return Uri of the searched file or null
   */
  @Nullable
  private Uri findFileFaster(DocumentFile directoryDf, String filename) {

    Uri childrenUri;
    var dirUri = directoryDf.getUri();
    try {
      childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(dirUri, DocumentsContract.getDocumentId(dirUri));
    }
    catch (Exception ex) {
      return null;
    }

    // load all of the needed data in a single shot
    try (
      Cursor c = getContext().getContentResolver().query(childrenUri, new String[] {
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,    // 0
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,   // 1
      }, null, null, null);
    ) {
      while (c != null && c.moveToNext()) {
        var displayName = c.getString(1);
        if (Objects.equals(displayName, filename)) {
          final var documentId = c.getString(0);
          return DocumentsContract.buildDocumentUriUsingTree(dirUri, documentId);
        }
      }
    }
    return null;
  }
  /**
   * More efficient method to retrieve directory content, avoiding calls to
   * slow DocumentFile methods like .getDisplayName()
   *
   * @see "https://stackoverflow.com/questions/42186820/why-is-documentfile-so-slow-and-what-should-i-use-instead"
   *
   * @param directoryUri URI of the directory to be searched
   *
   * @return JSArray of JSObject items, ready to be returned to JS
   */
  @Nullable
  private String listFileFaster(Uri directoryUri) {

    final var childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(directoryUri, DocumentsContract.getDocumentId(directoryUri));

    // load all of the needed data in a single shot
    try (
      Cursor c = getContext().getContentResolver().query(childrenUri, new String[] {
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,    // 0
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,   // 1
        DocumentsContract.Document.COLUMN_MIME_TYPE,      // 2
        DocumentsContract.Document.COLUMN_FLAGS,          // 3
        DocumentsContract.Document.COLUMN_SIZE,           // 4
        DocumentsContract.Document.COLUMN_LAST_MODIFIED,  // 5
      }, null, null, null);
      var sw = new StringWriter();
      var jw = new JsonWriter(sw);
    ) {
      if (c == null) return null;

      final var recordCount = c.getCount();
      // to avoid multiple resizes, pre-allocate space assuming 600 bytes x /record
      sw.getBuffer().ensureCapacity(recordCount * 600);

      jw.beginArray();
      while (c.moveToNext()) {
        final var mimeType = c.getString(2);
        jw.beginObject();
        jw.name("displayName").value(c.getString(1));  // displayName
        jw.name("uri").value(DocumentsContract.buildDocumentUriUsingTree(directoryUri, c.getString(0)).toString());  // file URI
        jw.name("type").value(mimeType);               // mime type
        jw.name("isDirectory").value(mimeType == DocumentsContract.Document.MIME_TYPE_DIR);  // true if it's a sub-directory
        jw.name("size").value(c.getLong(4));           // size
        jw.name("lastModified").value(c.getLong(5));   // last modified timestamp
        jw.endObject();
      }
      jw.endArray();
      jw.close();
      return sw.toString();
    }
    catch (Exception ignored) {
      return null;
    }
  }

  /****************************************************************************
   * The code below comes from Filesystem Capacitor plugin (with some changes)
   ****************************************************************************/
  public Charset getEncoding(String encoding) {
    if (encoding == null) {
      return null;
    }
    return switch (encoding) {
      case "utf8" -> StandardCharsets.UTF_8;
      case "utf16" -> StandardCharsets.UTF_16;
      case "ascii" -> StandardCharsets.US_ASCII;
      default -> null;
    };
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

  /**
   * Get mimeType from a filename
   */
  private String getMimeType(String url) {
    var extension = MimeTypeMap.getFileExtensionFromUrl(url);
    return extension != null ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) : "unknown";
  }

  /**
   * Parse the given PluginCall "directoryUri" parameter and return the associated DocumentFile.
   * In case of error, reject the call and return null.
   */
  @Nullable
  private DocumentFile getDirectoryDfFromCall(PluginCall call) {

    // get input arguments
    var directoryUri = call.getString("directoryUri", null);
    if (directoryUri == null || directoryUri.isBlank()) {
      call.reject("Invalid or missing directory", ERR_INVALID_URI);
      return null;
    }

    // text if it exists
    DocumentFile directoryDf = null;
    try {
      // could throw errors if malformed
      directoryDf = DocumentFile.fromTreeUri(getContext(), Uri.parse(directoryUri));
    }
    catch (Exception ignored) { }
    if (directoryDf == null || !directoryDf.exists()) {
      call.reject("Invalid or missing directory", ERR_INVALID_URI);
      return null;
    }
    return directoryDf;
  }

  /**
   * Parse the given PluginCall "fileUri" parameter and return the corresponding DocumentFile.
   * In case of error, reject the call and return null.
   */
  @Nullable
  private DocumentFile getFileDfFromCall(PluginCall call) {
    var fileUri = call.getString("fileUri", null);
    if (fileUri == null || fileUri.isBlank()) {
      call.reject("Invalid or missing fileUri", ERR_INVALID_URI);
      return null;
    }
    var df = DocumentFile.fromTreeUri(getContext(), Uri.parse(fileUri));
    if (df == null || !df.exists()) {
      call.reject("File not found", ERR_NOT_FOUND);
      return null;
    }
    return df;
  }

}
