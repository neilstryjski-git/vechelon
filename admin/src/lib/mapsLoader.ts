import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

/**
 * Call setOptions once at module load time so the API key is always registered
 * before any importLibrary() call elsewhere in the app.
 * v2.0.2 removed the Loader class — use this module as the single entry point.
 */
setOptions({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
  v: 'weekly',
  libraries: ['marker'],
});

export { importLibrary };
