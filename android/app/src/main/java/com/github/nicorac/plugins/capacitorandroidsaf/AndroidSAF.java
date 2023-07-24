// package com.github.nicorac.plugins.capacitorandroidsaf;
// import android.app.Activity;
// import android.content.Intent;
//
// import androidx.activity.result.ActivityResultLauncher;
//
// public class AndroidSAF extends Activity {
//
////   // actions launcher instance
////   public ActivityResultLauncher<Intent> activityResultLauncher;
////
//
////     public String selectFolder(String value) {
//////
//////       // open folder selector
//////       Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
//////       startActivityForResult(intent, 123);
//////
//////
//////       Log.i("selectFolder", value);
//////         return value;
////     }
//
//   // This method is called when the second activity finishes
//   @Override
//   protected void onActivityResult(int requestCode, int resultCode, Intent data) {
//
//     // check that it is the SecondActivity with an OK result
//     if (requestCode == 123) {
//       if (resultCode == RESULT_OK) { // Activity.RESULT_OK
//
//         // get String data from Intent
//         String returnString = data.getStringExtra("keyName");
//
//       }
//     }
//   }
// }
