export * from './browser/ui.js';

window.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing Camogie Team Optimization...');
  
  try {
    await initApp();
  } catch (error) {
    console.error('Failed to initialize:', error);
    alert('Failed to initialize. Please check the console for details.');
  }
});
