module.exports = {
  apps: [
    {
      name: "clinplanner-whatsapp",
      cwd: __dirname,
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "4100",
      },
    },
  ],
};
