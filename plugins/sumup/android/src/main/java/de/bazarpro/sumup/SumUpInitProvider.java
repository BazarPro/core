package de.bazarpro.sumup;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import com.sumup.reader.sdk.api.SumUpState;

/**
 * SumUp wants SumUpState.init in Application.onCreate. A provider runs even earlier, in
 * every process start, so the SDK is ready before Android restores one of its screens.
 * This keeps the app module free of SumUp code. It provides no data.
 */
public class SumUpInitProvider extends ContentProvider {

    @Override
    public boolean onCreate() {
        if (getContext() != null) {
            SumUpState.init(getContext().getApplicationContext());
        }
        return true;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sortOrder) {
        return null;
    }

    @Override
    public String getType(Uri uri) {
        return null;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] args) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] args) {
        return 0;
    }
}
