package com.github.nicorac.plugins.capacitorandroidsaf;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
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
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Objects;

@CapacitorPlugin(name = "AndroidSAF")
public class AndroidSAFPlugin extends Plugin {

  private static final String ERR_CANCELED = "ERR_CANCELED";
  private static final String ERR_INVALID_URI = "ERR_INVALID_URI";
  private static final String ERR_INVALID_CONTENT = "ERR_INVALID_CONTENT";
  private static final String ERR_NOT_FOUND = "ERR_NOT_FOUND";
  private static final String ERR_IO_EXCEPTION = "ERR_IO_EXCEPTION";
  private static final String ERR_UNKNOWN = "ERR_UNKNOWN";

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

    // get directory param
    var directoryDF = parseDirectoryParameter(call);
    if (directoryDF == null) return;

    // return files list
    try {
      var ret = new JSObject();
      ret.put("items", this.listFileFaster(directoryDF.getUri()));
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

    // Get a DocumentFile from the given "directory" and "filename" params
    var fileDF = getFileFromDirectoryAndFilenameParameters(call);
    if (fileDF == null) {
      call.reject("File not found", ERR_NOT_FOUND);
      return;
    }

    // if an "encoding" has been specified, file content is passed as string
    // otherwise it's passed as BASE64 string
    var encoding = call.getString("encoding", null);
    var charset = getEncoding(encoding);

    // load file content
    String content;
    try (
      var is = getContext().getContentResolver().openInputStream(fileDF.getUri());
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
   * Test if file exists
   */
  @PluginMethod()
  public void fileExists(PluginCall call) {

    try {
      // test if file exists
      final var res = new JSObject();
      res.put("exists", getFileFromDirectoryAndFilenameParameters(call) != null);
      call.resolve(res);
    }
    catch (Exception ex) {
      call.reject("Unknown exception: " + ex.getMessage(), ERR_UNKNOWN);
    }

  }

  /**
   * Write content to an existing file
   *
   * @param call
   *  call.uri: URI of the file to read
   */
  @PluginMethod()
  public void writeFile(PluginCall call) {

    // get directory param
    var directoryDF = parseDirectoryParameter(call);
    if (directoryDF == null) return;

    // get filename param
    var filename = parseFilenameParameter(call);
    if (filename == null) return;

    // if an "encoding" has been specified, file content is passed as string
    // otherwise it's passed as BASE64 string
    var encoding = call.getString("encoding", null);
    var charset = getEncoding(encoding);

    // if file does not exist, create it
    var fileDF = findFileFaster(directoryDF.getUri(), filename);
    if (fileDF == null) {
      // create a file with proper mimeType
      fileDF = directoryDF.createFile(getMimeType(filename), filename);
    }
    if (fileDF == null) {
      call.reject("Error opening/creating file", ERR_IO_EXCEPTION);
      return;
    }

    // Get content
    var content = call.getString("content", null);
    if (content == null) {
      call.reject("Invalid or missing content", ERR_INVALID_CONTENT);
      return;
    }

    // write content (and resolve/reject call)
    try {
      _writeFileContent(fileDF.getUri(), content, charset);
    } catch (IOException e) {
      call.reject("Error writing to file", ERR_IO_EXCEPTION);
    }

    call.resolve();
  }

  /**
   * Write file content to existing file with the given URI
   */
  private void _writeFileContent(Uri uri, String content, Charset charset) throws IOException {
    try (
      var os = getContext().getContentResolver().openOutputStream(uri, "wt");
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
   */
  @PluginMethod()
  public void deleteFile(PluginCall call) {

    // get file from "directory" and "filename" params
    var fileDF = getFileFromDirectoryAndFilenameParameters(call);

    // delete file
    if (fileDF != null && !fileDF.delete()) {
      call.reject("Error deleting file", ERR_IO_EXCEPTION);
    }
    else {
      call.resolve();
    }
  }

  /**
   * Get file URI
   */
  @PluginMethod()
  public void getUri(PluginCall call) {

    // get file from "directory" and "filename" params
    var fileDF = getFileFromDirectoryAndFilenameParameters(call);

    // return URI
    if (fileDF != null) {
      var ret = new JSObject();
      ret.put("uri", fileDF.getUri().toString());
      call.resolve(ret);
    } else {
      call.reject("Error getting file URI", ERR_UNKNOWN);
    }

  }

  /**
   * More efficient method to find a file in a given directory, avoiding calls to slow DocumentFile methods.
   *
   * @see "https://stackoverflow.com/questions/42186820/why-is-documentfile-so-slow-and-what-should-i-use-instead"
   */
  @Nullable
  private DocumentFile findFileFaster(Uri directoryUri, String filename) {

    final var childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(directoryUri, DocumentsContract.getDocumentId(directoryUri));

    // load all of the needed data in a single shot
    try (
      Cursor c = getContext().getContentResolver().query(childrenUri, new String[] {
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,    // 0
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,   // 1
      }, null, null, null);
    ) {
      while (c != null && c.moveToNext()) {
        if (Objects.equals(c.getString(1), filename)) {
          final var documentId = c.getString(0);
          var fileUri = DocumentsContract.buildDocumentUriUsingTree(directoryUri, documentId);
          return DocumentFile.fromSingleUri(getContext(), fileUri);
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
   * @param directoryUri URI of the folder to be searched
   *
   * @return JSArray of JSObject items, ready to be returned to JS
   */
  private JSArray listFileFaster(Uri directoryUri) {

    final var childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(directoryUri, DocumentsContract.getDocumentId(directoryUri));
    final var result = new JSArray();

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
    ) {
      while (c != null && c.moveToNext()) {
        final var item = new JSObject();
        final var documentId = c.getString(0);
        final var mimeType = c.getString(2);
        final var flags = c.getInt(3);

        item.put("name", c.getString(1));
        item.put("uri", DocumentsContract.buildDocumentUriUsingTree(directoryUri, documentId).toString());
        item.put("type", mimeType);
        item.put("isDirectory", mimeType == DocumentsContract.Document.MIME_TYPE_DIR);
        item.put("isVirtual", flags & DocumentsContract.Document.FLAG_VIRTUAL_DOCUMENT);
        item.put("size", c.getLong(4));
        item.put("lastModified", c.getLong(5));

        // append to result
        result.put(item);
      }
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

  /**
   * Get mimeType from a filename
   */
  private String getMimeType(String url) {
    String type = "unknown";
    String extension = MimeTypeMap.getFileExtensionFromUrl(url);
    if (extension != null) {
      type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
    }
    return type;
  }

  /**
   * Parse the given PluginCall "directory" parameter and return a FileDocument that describes it.
   * In case of error, reject the call and return null.
   */
  @Nullable
  private DocumentFile parseDirectoryParameter(PluginCall call) {

    // get input arguments
    var directory = call.getString("directory", null);
    if (directory == null || directory.trim().length() == 0) {
      call.reject("Invalid or missing directory", ERR_INVALID_URI);
      return null;
    }
    // text if it exists
    Uri directoryUri = null;
    DocumentFile directoryDf = null;
    try {
      // could throw errors if malformed
      directoryUri = Uri.parse(directory);
      directoryDf = DocumentFile.fromTreeUri(getContext(), directoryUri);
    }
    catch (Exception ignored) { }
    if (directoryDf == null || !directoryDf.exists()) {
      call.reject("Invalid or missing directory", ERR_INVALID_URI);
      return null;
    }
    return directoryDf;

  }

  /**
   * Parse the given PluginCall "filename" parameter and return its filename.
   * In case of error, reject the call and return null.
   */
  @Nullable
  private String parseFilenameParameter(PluginCall call) {
    var filename = call.getString("filename", null);
    if (filename == null || filename.trim().length() == 0) {
      call.reject("Invalid or missing filename", ERR_INVALID_URI);
      return null;
    }
    return filename;
  }

  /**
   * Return a DocumentFile instance from PluginCall "directory" and "filename" parameters.
   * In case of error, reject the call and return null.
   * If file does not exist returns null.
   */
  @Nullable
  private DocumentFile getFileFromDirectoryAndFilenameParameters(PluginCall call) {
    // get directory param
    var directoryDF = parseDirectoryParameter(call);
    if (directoryDF == null) return null;
    // get filename param
    var filename = parseFilenameParameter(call);
    if (filename == null) return null;
    // find file and return it
    return findFileFaster(directoryDF.getUri(), filename);
  }

}
