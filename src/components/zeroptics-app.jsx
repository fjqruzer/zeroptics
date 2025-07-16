"use client"

import { useState, useRef, useEffect } from "react"
import { Upload, Camera } from "lucide-react"
import { recognizeTextFromFile } from "@/services/ocrService"
import jsPDF from "jspdf"

export default function ZeropticsApp() {
  const [isHovered, setIsHovered] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const hoverTimeoutRef = useRef(null)
  const modalRef = useRef(null)
  const [ocrResult, setOcrResult] = useState("")
  const [showOcrModal, setShowOcrModal] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const videoRef = useRef(null)
  const [capturedImage, setCapturedImage] = useState(null)
  const [facingMode, setFacingMode] = useState("environment") // NEW: camera facing mode


  useEffect(() => {
    if (!showCameraModal && cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop())
      setCameraStream(null)
    }
  }, [showCameraModal])

  useEffect(() => {
    if (!showAbout) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") setShowAbout(false);
    }
    function handleClick(e) {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        setShowAbout(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [showAbout]);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false)
    }, 400) // 400ms timeout
  }

  const handleUploadFile = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*,.pdf"
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (file) {
        setOcrLoading(true)
        setOcrProgress(0)
        setShowOcrModal(true)
        try {
          const text = await recognizeTextFromFile(file, (m) => {
            if (m.status === "recognizing text" && m.progress) {
              setOcrProgress(Math.round(m.progress * 100))
            }
          })
          setOcrResult(text)
        } catch (err) {
          setOcrResult("Error: " + err.message)
        } finally {
          setOcrLoading(false)
        }
      }
    }
    input.click()
  }

  const handleUseCamera = () => {
    setCapturedImage(null)
    setOcrResult("")
    setOcrLoading(false)
    setOcrProgress(0)
    setShowCameraModal(true)
  }


  // Open camera stream when showCameraModal or facingMode changes
  useEffect(() => {
    if (showCameraModal) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode } })
        .then((stream) => {
          setCameraStream(stream)
          if (videoRef.current) {
            videoRef.current.srcObject = stream
          }
        })
        .catch((err) => {
          console.error("Camera access denied:", err)
        })
    }
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop())
      }
    }
    // eslint-disable-next-line
  }, [showCameraModal, facingMode])

  const handleCapture = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(async (blob) => {
      if (blob) {
        setCapturedImage(URL.createObjectURL(blob))
        setOcrLoading(true)
        setOcrProgress(0)
        try {
          const text = await recognizeTextFromFile(blob, (m) => {
            if (m.status === "recognizing text" && m.progress) {
              setOcrProgress(Math.round(m.progress * 100))
            }
          })
          setOcrResult(text)
        } catch (err) {
          setOcrResult("Error: " + err.message)
        } finally {
          setOcrLoading(false)
        }
      }
    }, "image/png")
  
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop())
      setCameraStream(null)
    }
  }

  // Export OCR result as PDF
  const handleExportPdf = () => {
    const doc = new jsPDF()

    const lines = doc.splitTextToSize(ocrResult, 180)
    doc.text(lines, 10, 10)
    doc.save("ocr-result.pdf")
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        {/* Glasses Icon */}
        <div
          className="relative inline-block"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* SVG */}
          <svg
  fill="#ffffff"
  height="50px"
  width="50px"
  viewBox="0 0 32 32"
  stroke="#ffffff"
>
  <g strokeWidth="0"></g>
  <g strokeLinecap="round" strokeLinejoin="round"></g>
  <g>
    <g>
      <circle cx="16" cy="11" r="2"></circle>
      <path d="M16,2C8,2,0,4.1,0,8v16c0,2.1,2.4,3.9,6.8,5c0.3,0.1,0.6,0,0.9-0.2S8,28.3,8,28v-7.2c2.4-0.5,5.1-0.8,8-0.8
        c2.9,0,5.6,0.3,8,0.8V28c0,0.3,0.1,0.6,0.4,0.8c0.2,0.1,0.4,0.2,0.6,0.2c0.1,0,0.2,0,0.2,0c4.4-1.1,6.8-2.9,6.8-5V8
        C32,4.1,24,2,16,2z M6,26.7c-2.7-0.9-4-2-4-2.7V11c1,0.7,2.3,1.3,4,1.7V26.7z M23.8,11.6C23.6,11.8,20.3,16,16,16s-7.6-4.2-7.8-4.4
        c-0.3-0.4-0.3-0.9,0-1.2C8.4,10.2,11.7,6,16,6s7.6,4.2,7.8,4.4C24.1,10.7,24.1,11.3,23.8,11.6z M30,24c0,0.7-1.3,1.8-4,2.7V12.8
        c1.7-0.5,3-1.1,4-1.7V24z"></path>
    </g>
  </g>
</svg>

          {/* Circular Navigation  */}
          <div
            className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ${
              isHovered ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"
            }`}
          >
            {/* Upload File  */}
            <button
              onClick={handleUploadFile}
              className="absolute bg-slate-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 hover:scale-110 group"
              style={{
                top: "-60px",
                left: "-60px",
                transform: "translate(-50%, -50%)",
              }}
            >
              <Upload size={20} />
              <span className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 text-xs text-white bg-gray-800 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Upload File
              </span>
            </button>

            {/* Use Camera */}
            <button
              onClick={handleUseCamera}
              className="absolute bg-slate-600 hover:bg-green-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 hover:scale-110 group"
              style={{
                top: "-60px",
                right: "-60px",
                transform: "translate(50%, -50%)",
              }}
            >
              <Camera size={20} />
              <span className="absolute top-full right-1/2 transform translate-x-1/2 mt-2 text-xs text-white bg-gray-800 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Use Camera
              </span>
            </button>
          </div>
        </div>

        {/* Main Title */}
        <h1
          className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-4 cursor-pointer select-none hover:text-green-600"
          onClick={() => setShowAbout(true)}
        >
          Zeroptics.
        </h1>

        {/* Subtitle */}
        <p
          className={`text-gray-400 text-md transition-opacity duration-300 ${
            isHovered ? "opacity-50" : "opacity-100"
          }`}
        >
          Hover the eye to start.
        </p>


        <div
          className={`mt-6 transition-all duration-300 ${
            isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <p className="text-gray-300 text-sm">Choose your OCR method</p>
        </div>
      </div>
      {/* footer creds */}
      <a
        href="https://tesseract-ocr.github.io"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 left-1/2 transform -translate-x-1/2 text-gray-400 hover:text-white text-xs bg-black bg-opacity-60 px-3 py-1 rounded shadow animate-pulse hover:animate-none"
        style={{ zIndex: 50 }}
      >
        Powered by Tesseract
      </a>
      {/* Modal: About Zeroptics */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 transition-opacity">
          <div
            ref={modalRef}
            className="bg-[#18181b] border border-gray-700 rounded-lg shadow-lg p-6 min-w-[320px] max-w-xs text-green-400 font-mono text-sm relative animate-fade-in"
            style={{ boxShadow: "0 4px 32px 0 #000a" }}
          >
            <div className="mb-2 text-green-500">$ Zeroptics --about</div>
            <div className="whitespace-pre-line text-green-300">
              Zeroptics is a lightweight OCR app by Zero One that converts images to text using Tesseract.\nFast, accurate, and built for clarity.
            </div>
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-green-400 text-lg focus:outline-none"
              onClick={() => setShowAbout(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {/* Modal: OCR Result */}
      {showOcrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 transition-opacity">
          <div
            className="bg-[#18181b] border border-gray-700 rounded-lg shadow-lg p-6 min-w-[320px] max-w-lg w-full sm:w-auto text-green-400 font-mono text-sm relative animate-fade-in flex flex-col"
            style={{ boxShadow: "0 4px 32px 0 #000a", maxHeight: "90vh" }}
          >
            <div className="mb-2 text-green-500">$ Zeroptics --ocr-result</div>
            <div className="whitespace-pre-line text-green-300 min-h-[80px] overflow-auto" style={{ maxHeight: "50vh" }}>
              {ocrLoading ? (
                <>
                  <div>Recognizing text...</div>
                  <div className="w-full bg-gray-800 rounded h-2 mt-2 mb-2">
                    <div
                      className="bg-green-500 h-2 rounded"
                      style={{ width: `${ocrProgress}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-400">{ocrProgress}%</div>
                </>
              ) : (
                ocrResult || "No text found."
              )}
            </div>
            {/* Export as PDF button */}
            {!ocrLoading && ocrResult && (
              <button
                className="mt-4 bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded shadow transition-all duration-200"
                onClick={handleExportPdf}
              >
                Export as PDF
              </button>
            )}
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-green-400 text-lg focus:outline-none"
              onClick={() => setShowOcrModal(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {/* Modal: Camera Terminal */}
      {showCameraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 transition-opacity">
          <div
            className="bg-[#18181b] border border-green-700 rounded-lg shadow-lg p-6 min-w-[320px] max-w-lg w-full sm:w-auto text-green-400 font-mono text-sm relative animate-fade-in flex flex-col items-center"
            style={{ boxShadow: "0 4px 32px 0 #000a", maxHeight: "90vh" }}
          >
            <div className="mb-2 text-green-500 w-full">$ Zeroptics --camera</div>
            {!capturedImage && (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="rounded border border-green-700 bg-black mb-4 w-full max-h-64 object-contain"
                  style={{ background: "#000", minHeight: "180px" }}
                />
                <button
                  className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded shadow transition-all duration-200 font-mono text-base w-full mb-2 border border-gray-500"
                  onClick={() => setFacingMode((prev) => (prev === "user" ? "environment" : "user"))}
                >
                  Flip Camera
                </button>
                <button
                  className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded shadow transition-all duration-200 font-mono text-base w-full mb-2 border border-green-500"
                  onClick={handleCapture}
                >
                  Capture
                </button>
              </>
            )}
            {/* Show captured image and OCR result */}
            {capturedImage && (
              <>
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="rounded border border-green-700 bg-black mb-4 w-full max-h-64 object-contain"
                  style={{ background: "#000" }}
                />
                <div className="whitespace-pre-line text-green-300 min-h-[80px] overflow-auto w-full" style={{ maxHeight: "30vh" }}>
                  {ocrLoading ? (
                    <>
                      <div>Recognizing text...</div>
                      <div className="w-full bg-gray-800 rounded h-2 mt-2 mb-2">
                        <div
                          className="bg-green-500 h-2 rounded"
                          style={{ width: `${ocrProgress}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-400">{ocrProgress}%</div>
                    </>
                  ) : (
                    ocrResult || "No text found."
                  )}
                </div>
                {/* Export as PDF button */}
                {!ocrLoading && ocrResult && (
                  <button
                    className="mt-4 bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded shadow transition-all duration-200 w-full border border-green-500"
                    onClick={handleExportPdf}
                  >
                    Export as PDF
                  </button>
                )}
              </>
            )}
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-green-400 text-lg focus:outline-none"
              onClick={() => setShowCameraModal(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
