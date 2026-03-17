/* eslint-env jest */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@zen-capsule/shared', () => ({
  createApiClient: jest.fn(() => ({})),
}), { virtual: true });
