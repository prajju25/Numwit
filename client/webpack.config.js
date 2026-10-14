const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: "./src/index.jsx",
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
    publicPath: "/",
  },
  resolve: {
    extensions: [".js", ".jsx"],
  },
  devServer: {
    static: "./public",
    historyApiFallback: true,
    port: 3000,
    proxy: [
      {
        context: ["/api", "/socket.io"],
        target: "http://localhost:5000",
        ws: true,
      },
    ],
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: "babel-loader",
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader", "postcss-loader"],
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        type: "asset/resource",
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./public/index.html", // <== Important!
    }),
    // Umami website id (public, not a secret) — analytics stays off when empty.
    // Set via fly.toml [build.args] → Dockerfile ARG → this env var.
    new webpack.DefinePlugin({
      "process.env.UMAMI_WEBSITE_ID": JSON.stringify(process.env.UMAMI_WEBSITE_ID || ""),
    }),
    // Icons, manifest, service worker, robots.txt, sitemap.xml, og-image —
    // served from the site root as-is.
    new CopyWebpackPlugin({
      patterns: [{ from: "public", to: ".", globOptions: { ignore: ["**/index.html"] } }],
    }),
  ],
};
