# Page components

Each large page component is defined in its own file in this folder. The authenticated app shell in `../app/TimeTableApp.jsx` owns session state, the navigation layout, and cross-page actions. Shared form/metric controls are in `../components/SharedComponents.jsx`; API utilities and role-based navigation are in `../core`.

The route names remain defined by `../core/pageRoutes.js`, so URLs and existing module permissions stay consistent with the current multi-page navigation.
