using Inventor;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;

namespace InventorAssemblyPlugin
{
    [ComVisible(true)]
    public class SampleAutomation
    {
        InventorServer inventorApplication;
        public SampleAutomation(InventorServer inventorApp)
        {
            inventorApplication = inventorApp;
        }

        public void Run(Document doc)
        {
            LogTrace("Run called with asdf");
        }

        public void RunWithArguments(Document doc, NameValueMap map)
        {
            //LogInputData(doc, map);
            LogTrace("Run called with");
        }


        #region Logging utilities
        private static void LogInputData(Document doc, NameValueMap map)
        {
            // dump doc name
            var traceInfo = new StringBuilder("RunWithArguments called with '");
            traceInfo.Append(doc.DisplayName);

            traceInfo.Append("'. Parameters: ");

            // dump input parameters
            // values in map are keyed on _1, _2, etc
            string[] parameterValues = Enumerable
                                        .Range(1, map.Count)
                                        .Select(i => (string)map.Value["_" + i])
                                        .ToArray();
            string values = string.Join(", ", parameterValues);
            traceInfo.Append(values);
            traceInfo.Append(".");

            LogTrace(traceInfo.ToString());
        }

        /// <summary>
        /// Log message with 'trace' log level.
        /// </summary>
        private static void LogTrace(string format, params object[] args)
        {
            Trace.TraceInformation(format, args);
        }

        /// <summary>
        /// Log message with 'trace' log level.
        /// </summary>
        private static void LogTrace(string message)
        {
            Trace.TraceInformation(message);
        }

        /// <summary>
        /// Log message with 'error' log level.
        /// </summary>
        private static void LogError(string format, params object[] args)
        {
            Trace.TraceError(format, args);
        }

        /// <summary>
        /// Log message with 'error' log level.
        /// </summary>
        private static void LogError(string message)
        {
            Trace.TraceError(message);
        }

        #endregion
    }
}
